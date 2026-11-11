# PULSE V1 "OPEN FIELD" — the implementation plan

Status: COMPLETE — revision 2 (sections 0-11; the last line of the file repeats the status).
Written 2026-10-11 by the tech lead on branch `pulse-redesign` (HEAD `0860942`), read-only on the codebase.
Revision 2 (same day) answers three adversarial reviews (collisions, gates, reality). Section 11 maps every
finding to the place it was fixed and lists the findings that were not taken, with the reason.

This file is THE plan. It was made from two competing plans (`plan-safe.md`, `plan-fast.md`) and the six reader
notes in `understand/`. Where this file and one of those two disagree, this file wins. Where this file says
"adopted from safe §x / fast §x", that section is the detail and is not repeated here.
Machine-readable twin: `docs/pipeline/pulse/work-packages.json` — it is the ONE source for who owns which file;
the tables here are a reading aid, and where they differ the JSON wins. Owner decisions D1-D4
(`understand/00-owner-decisions.md`) are final and are not re-opened.

Paths are relative to `C:/Users/Petike/Documents/Cursor/tracker/` unless absolute.
Sizes: S / M / L / XL = a short agent run / one run / one long run / a run that will need a resume.

Vocabulary: **INT** = the one integrator. **Lane** = a Phase 0 slice of shared code. **Package** = a Phase 1
slice of feature code. **Bridge** = legacy NAMES kept declared so unmigrated files still build; the VALUES are
Pulse. **Ratchet** = `check:pulse`, a gate that counts legacy constructs per file against a budget that may only
go down. **Hybrid** = an unmigrated screen between the switch and its own package: Pulse colour, type and shell
over the old structure. **Freeze** = the API responses recorded once from the seeded database, plus the database
copy they came from. **Replay** = a capture in which every `/api` request is answered from the freeze (no
backend, no login, a fixed clock). **Live** = a capture against the running backend. **Hand-in files** = the
files under `docs/pipeline/pulse/pkg/<id>/` through which a lane or package asks for edits in files it does not
own. **Sandbox objects** = the plan, post and accounts created for writing during verification.

---

## 0. The plan in twelve lines

1. **Hard switch of values, bridge of names (D1).** One serial step by INT turns the whole app black / lime /
   Big Shoulders. Every legacy name stays declared, so no commit is ever red. The old look lives on `master` only.
2. **The net is built at the same time as the switch, not before it.** While INT switches, four lanes re-point the
   gates, build the headless capture tool, the integration tools and the image pipeline. Then the data is frozen:
   recorded once, replayed for every "before" picture, sweep and pair from then on.
3. **Shared recipes are restyled in place** (`control.ts`, `Field`, `Sheet`, `Toast`, `BottomNav`, `EmptyState`,
   `Skeleton`); a new component is a new file; there is no `ui/pulse/` twin folder.
4. **Nothing changes a control's height or a text size behind a screen's back.** The 56 pt pill is opt-in per
   call site until the screen migrates; every legacy type step and legacy button variant keeps its old metrics.
5. **The kit lands in two stages.** Stage 1 is exactly what Home and Auth need; they start as soon as it is in.
6. **One worktree per agent slot, one for INT, one per reviewer.** One branch and one squash commit per package.
   The owner's checkout is only ever fast-forwarded to a commit that was built green somewhere else.
7. **One integrator owns every shared file**: tokens, `src/ui`, `src/app`, `src/lib`, the three i18n bundles,
   scripts, `package.json`. Lanes and packages hand in patch files; a tool applies them the same way in the slot
   and at the merge.
8. **Home, Auth and Profil first** (3 agents). Home reviewed + the foundation accepted opens the fan-out:
   4 agents, then 6. Long poles and the member's five tabs go first.
9. **24 packages for the 24 screens**, file-disjoint, each resumable on its own branch.
10. **Done means captured, measured, probed, inventoried and reviewed** — a frame is matched only on a replay
    capture of the BUILT app at 402 x H, scale 2, insets 62 / 34, with its boxes measured against the geometry
    exported from Figma, no undeclared console error and an explained inventory diff.
11. **Review is rolling**: an agent that did not build a screen compares it with its frame as soon as it is merged.
12. **Everything is on disk**: a live progress file, a status file per package, work-in-progress commits on the
    package branch. A dead run continues; it never restarts.

### 0.1 Where the two plans disagreed, and the ruling

| # | Point | Safe | Fast | Ruling | Why, in one line |
|---|---|---|---|---|---|
| 1 | Working trees | worktree per agent, squash merge | one shared tree + one verify tree | **worktree per slot, branch per package, squash merge** | a red build then means "my change", work in progress is committed, and the owner's checkout never shows half a screen |
| 2 | Agents at once | 4 | 6 (8) | **ramp 3 -> 4 -> 6** | memory is spent by builds and captures, not by idle worktrees; those run under a 2-slot lock, so six fit |
| 3 | Order of Phase 0 | gates + baseline before any pixel | switch first, gates later | **both at once** | the baseline is taken from a frozen worktree of the base commit, so it does not have to block the switch |
| 4 | State-carrying legacy tokens (`-subtle`, `-border`, `on-*`) | stay visible | neutralised | **safe** | neutralising `accent-subtle` hides the selected state at 82 sites with a green build |
| 5 | Legacy type steps | old metrics, new family | re-pointed to the nearest Pulse size | **safe**, for all ten (R3) | zero reflow on 615 call sites nobody is looking at |
| 6 | Legacy button variants | keep their bridged look | aliased to Pulse looks on day one | **safe** | an alias changes the hit geometry of 110 controls on unwatched screens, for a look that lives days |
| 7 | Pill height | opt-in `size`, 44 stays the default | 56 centrally | **safe** | the workout player is one viewport tall by law |
| 8 | `--content-pad-b` | keeps its meaning; new `--page-pad-b` | re-defined; player edits later | **safe** | the player reads it and must stay correct without a feature edit |
| 9 | Sub-state in the URL (`?tab=`) | no | yes, one hook | **safe** | new product behaviour that no frame asks for; click scripts with an arrival check are enough |
| 10 | Dev backend rate limiters | off (`NODE_ENV=test`) | on, one cached login per role | **fast**, with one cookie jar per account (R19) | no security-relevant process setting changes without the owner's word; replay needs no login at all |
| 11 | D2 redirect (idle Edzés -> library) | inside the workout package | Phase 0 | **fast** | an owner decision he sees on his first tap; it is five lines |
| 12 | Aurora retirement | by each screen package | one Phase 0 commit | **fast** | the gate leaves in the same commit as the last mount and its heir is already in the chain |
| 13 | Route-parent table + stricter door rule | yes | deferred | **safe** | back target, parent label and lit tab are one fact in three places — this repo's first defect class |
| 14 | Toasts | up to three lines in one band | one at a time, queued | **safe** | an Undo must never wait in a queue |
| 15 | First screens | Home + Profil, gate before fan-out | Home + Auth, no gate | **Home + Auth + Profil; the gate is Home reviewed + foundation accepted** | Auth is the quick win, Profil the second approved frame; only one screen has to gate |
| 16 | Kit before screens | all of it | two stages | **fast's stages on safe's lane cut** | Home and Auth need a third of the kit |
| 17 | Packages | 16 | 24 (one screen split in two) | **24** (the client page is two packages by file) | small units resume cheaply and shorten the long poles |
| 18 | Cost of one integration | full 59-state sweep every merge | package frames only | **package frames + smoke set; full sweep after any shared-file change and at wave boundaries** | a screen package cannot touch another screen (the merge check refuses it) |
| 19 | "No behaviour lost" evidence | runtime control inventory | source ledger (regex) | **both** | the inventory is the proof; the ledger is free and runs before any capture |
| 20 | Review | rolling, from the first merge | after all 24 | **safe** | a composition habit is corrected after two screens, not after twenty-four |
| 21 | Progress file writers | INT only + status files | everyone through a locking CLI | **safe**, split into a live file and a committed snapshot | one writer, no lock to get wrong, nothing lost by a reset |
| 22 | Requests to INT | JSON in a live inbox | markdown in the package folder | **safe's JSON + fast's `interim` field** | a worktree's files are not in INT's tree; one inbox is |
| 23 | Commits of the switch | six | three | **seven** (six + the gate-data extraction) | each is a resume point and a single `git revert` |
| 24 | Lead post, sharing controls, undrawn Home states | behaviour wins (asked) | frame wins (decided) | **owner question Q4, default: behaviour wins** | he judges by looking; nothing he can do today may vanish silently |
| 25 | Kit specimen | first section of `/playground`, collected by glob | `/playground?view=kit` | **safe** | no URL state and no shared file a lane has to edit to be listed |

### 0.2 Rulings added by the review (revision 2)

| # | Point | Revision 1 | Now | Why |
|---|---|---|---|---|
| 26 | What a capture reads | the live backend, a browser-pinned clock | **the freeze, replayed** (R24) | "today" is decided by the server clock at 104 sites; a reference that moves cannot prove equality |
| 27 | INT's bench | the main checkout | **an integration worktree; the main checkout only fast-forwards** (R28) | an unbuilt squash, a `reset --hard` and planted gate defects were hot-reloading into the owner's browser |
| 28 | Writes during verification | a table of "never" | **fail-closed in the capture tool + sandbox objects** (R25) | the editors have no save step: every tap is a server write |
| 29 | A lane's edits in files it does not own | prose, re-typed by INT | **hand-in files for lanes too, applied by the same tool twice** (R29) | two copies that must agree |
| 30 | Gate exemption lists | maps inside three gate scripts | **data files the tools write** (R30) | a slot could not reach a green build without editing a script it may not touch |
| 31 | Ratchet budgets | one file for all shared code | **one per lane and package, generated from the ownership file** | five lanes lowering one JSON file is a guaranteed conflict |
| 32 | Fixtures | free-hand JSON | **edits over a recorded response, schema-checked; verdict `matched-fixture`** (R26) | a fixture must not show data the product cannot produce |
| 33 | "Matches the frame" | judged on a pair image | **measured against geometry exported from Figma, judged on tiles** (R27) | 30 of the 59 frames reach an agent at under half resolution |
| 34 | Syncing a slot | `git merge pulse-redesign` | **`pulse-sync`: revert the local applies, merge, re-apply** | git refuses a merge over locally applied patches |

Both source plans agree on, and this plan keeps without discussion: restyle in place and no twin folder; one
integrator; i18n through patch files; baked-alpha WebP + one `Pic` component and no `mix-blend-` anywhere; the
three Fontsource packages with hand-written `@font-face`; the 16-step type ramp with `--text-giant` as a plain
length; family and case bound once in a `@layer components` block; the D1 default for element variants; capture
from the BUILT app in headless Chrome; frozen hook and logic files; no finish-workout control (D3); local commits
only (D4); a closing cleanup that deletes the bridge.

---

## 1. Decisions

### 1.1 Taken by this plan (the owner can veto any of them; none blocks a start)

| # | Decision | Reason |
|---|---|---|
| R1 | Hard switch of VALUES in Phase 0, bridge of NAMES until the closing cleanup. No `[data-theme='pulse']`, no flag, no per-screen opt-in. | D1; `check-tokens` fails every build on an undeclared `var()` (46 glass references in 10 areas). |
| R2 | Bridge rule: a legacy token that carries STATE keeps a visible, derived value; only DECORATION (glass, blur, shadow, aurora, sheen, tile tint) is neutralised. `--nav-bg`, `--toast-bg`, `--sheet-bg` stay opaque. | ruling 4; a transparent fixed nav over scrolling content is unreadable. |
| R3 | **Ten** legacy type steps keep their old metrics and only change family. Seven keep their names (`title-1/2/3`, `body-strong`, `body-s`, `caption`, `timer`). Three have a Pulse heir of the SAME name with other metrics (`body` 15 -> 16 px, `display` 34/40 -> 32/34, `micro` -> mono, uppercase, 16 px line): their 152 existing call sites are renamed by a codemod in F1.4 to `text-body-legacy`, `text-display-legacy`, `text-micro-legacy`, which carry the old metrics. All ten are counted by the ratchet and deleted from `tokens.css` and `TYPE_STEPS` in one closing commit. | ruling 5; without the rename three steps reflow 152 sites and the ratchet cannot see them. |
| R4 | `control()` gets a `size` axis: `md` (44, the default until closing), `lg` (56, the Pulse pill), `sm` (44, the small pill). A `primary` that can reach an element with no `size` is a ratchet count. `secondary`, `ghost`, `danger` and the chip tones keep compiling with their bridged look. | rulings 6, 7. |
| R5 | Shared recipes are restyled in place with their public API intact; props that Pulse no longer renders (`EmptyState.icon`, `SectionHeader.icon`, `ToastOptions.placement`) become optional and unrendered and are removed at the call sites by the screen packages. | second implementations are this repo's recurring defect; `noUnusedLocals` forces the follow-through. |
| R6 | Lanes work API-first: within its first commit a lane publishes compiling stubs of every export with final prop types and its page of the kit reference (`docs/pipeline/pulse/kit/<lane>.md`). Prop changes after that are additive only. | screen agents and other lanes code against the reference, not against internals (from fast). |
| R7 | Images: alpha baked into WebP (knee 32), `src/assets/pulse/`, one renderer `ui/media/Pic.tsx`, user media through `ui/media/UserPhoto.tsx`. **35 source images ship as 49 files** (density variants; 0.84 MB, cap 1.0 MB); 14 sources do not ship (R7 list in 3.3). The lit tab icon is a second raster. | `lighten` shows a black box under 7 of 12 ordinary parents (assets note §5.2). |
| R8 | Fonts: `@fontsource-variable/big-shoulders-display`, `@fontsource-variable/geist`, `@fontsource/geist-mono` (500). Hand-written `@font-face`, `latin` + `latin-ext`, `block` for the display face, `swap` for the others. Three families, as in all 59 frames. Installed dormant (F1.2) and **glyph-checked there**, two commits before anything visible depends on them. | Pulse System is the law; numerals are placed by ink and must not reflow from a fallback. |
| R9 | `--text-1/2/3` are the fixed hexes. `--accent-pressed`, `--shadow-glow` and the focus ring derive from `--accent`. The lime exists in exactly two places: the `--accent` declaration and its baked copy in `assets-src/pulse/assets.json` (the lit icons and medals are pixels); `check:assets` holds the two equal. A future pack needs a second lit raster set, not only a token. | D1: one place where a future pack overrides the accent — and an honest note about the one copy a token cannot reach. |
| R10 | The client theme engine is removed as the first visible commit of the switch, before any token changes. The "Megjelenés" section of `settings-2` is not drawn. | D1; a stored custom accent is written inline today and would override lime. |
| R11 | Element variants follow the default the owner already stated under D1: one Pulse look per element, with the behaviour of the letter the database serves at the freeze (the response of `GET /ui/element-styles` is part of the recording). A component that stops reading its letter becomes `live: false` + a dormant entry in the same commit. **The delta belongs to whoever owns the file that holds the `useElementVariant` call**: F8 (E6, E2), F11 (E11), F12 (E7, E14), F13 (E15), S-workout (E21, E22), S-coins (E25, E26). The 14 elements that only the playground renders are marked dormant ("playground only") when the gate learns to tell them apart (F2), and their files are retired in F20. `CURATED.E21` is aligned to `A` (tap). | the backend only knows letters A-E and is frozen; today the catalogue calls 14 elements "live" that no user ever sees. |
| R12 | Tab bar: icon KEY in `navTabs.ts`, image pairs resolved in `BottomNav`, both states always in the DOM. `--nav-h` and `--content-pad-b` are re-valued in the SAME commit as the bar. `/notifications` is owned by the Home tab (default of Q6). | `check-nav-active` imports `navTabs.ts` into bare Node; the owning tab stays lit. |
| R13 | Pushed-screen headers read their parent from one pure table, `app/routeMeta.ts`. `check-nav` counts a door only when it comes from outside the route's own subtree. `/compose` and `/m` have no such door on a phone today: they get exemptions that the gate prints as OPEN on every run, until Q5 is answered. No new door is invented. | ruling 13; "we will add the link later" is not a reason the gate accepts silently. |
| R14 | Toasts: one top band, the existing contract untouched (`toast(message, kind?, options \| fn)`, kinds, Undo, 4 s timer with pause, cap of 3 shown as up to three notice lines). The offline line is markup only; its drain, probe and `--offline-h` logic is not moved. | ruling 14; 12 raise sites and two undo flows depend on the contract. |
| R15 | D2 is a redirect and lands in Phase 0: no session at `/workout` -> `<Navigate to="/library" replace />`; a FAILED session read gets an error state with `common.retry`; `workout.noneTitle` / `noneBody` are deleted; `check-nav` gets a named required door. Home's permanent library row belongs to the Home package. | ruling 11; one URL per screen. |
| R16 | The aurora leaves in one Phase 0 commit: the nine mounts (mount line + import only), the component, its tokens and `check:aurora`. Its heir — `check:assets` "no `mix-blend-` in `src`", with a probe — is in the chain before that commit. | ruling 12; a gate is never left guarding nothing, and never removed without an heir. |
| R17 | The mannequin: screens keep mounting `<MuscleMap>`; its props change **additively only**. A small stage 0 (before wave 2) adds a controlled `side` / `onSideChange`, `sideControl="none"` and a fixed 597 : 1261 box, so a screen can draw the Elöl / Hátul switch and the legend where the frames put them and the later render swap cannot reflow anything. The render-based figure itself is its own lane (F15) and swaps the inside when ready. | the frames place the switch and legend in the screen's layout; today the side is internal state (`MuscleMap.tsx:93`). |
| R18 | Dead code is deleted by whoever owns the folder: the theme builders in the switch; `ui/TokenProof.tsx` with the kit host; `NutritionCard` + `MacroBars`, `AdminMetrics` (+ 14 keys), `SectionBadge` by their screen packages; the seven playground-only variant files in F20; `coaching/Monogram.tsx`, `Surface`, `SummaryTile`, `Gauge`, `DataTable` in closing. | each keeps dead i18n keys or legacy class sites alive. |
| R19 | The dev backend keeps its rate limiters ON. Replay captures need no login. For live runs the capture tool is the only automated login: **one cookie jar per fixture account** in the OS temp dir, logged in once and renewed with `POST /auth/refresh` under a lock (refresh allows 60 per 15 minutes; login 10). One process at a time holds a jar, so a refresh token is never used twice. The refresh cookie never enters a browser profile; a page only ever receives the access cookie. Jars are deleted at the end of the effort. | ruling 10; 7 accounts x a 12-minute access cache needed 8.75 logins per 15 minutes against a limit of 10 shared with the owner. `NODE_ENV=test` stays available — see 1.3. |
| R20 | No sub-state in the URL. Frames that are sub-states are reached by click scripts that address controls by accessible name only, and **every step ends in an `arrived` assertion**; a step whose target is missing fails the capture. | ruling 9; a script that silently stays on the default tab proves nothing twice. |
| R21 | Zero-inset floors are tokens: top 12 px, bottom 8 px. Above 430 pt a screen with no desktop layout today is a centred 430 column. The six files that have desktop behaviour today (`col-wide` or `lg:` in `AdminPage`, `AdminShell`, `StyleStudioPage`, `ChatPanel`, `ClientDetailPage`, `CoachDashboard`, plus the bar's desktop dock) **keep it**, in Pulse skin, proven against a 1280 px baseline. The Cmd+K palette is kept and minimally restyled. | the frames are drawn at 402 pt only; Q4's default says nothing a user has today disappears. A guess, logged in `deviations.md`. |
| R22 | Copy: no VISIBLE string without a source — the frame, the inventory note or `hu.json`. Where no string is drawn, nothing is written and the case goes to `copyQuestions`. A visible string an agent had to propose is listed in `copy-to-approve.md` and keeps its package at `merged` (not `accepted`) until the owner ticks it; it blocks nothing else. Strings only a screen reader gets (`aria-label`) may be proposed freely and are listed too. | "do not invent"; three languages must stay in parity; the owner has to see what he did not draw. |
| R23 | Mergeability: `backend/` is never touched; hooks, routes, query keys and everything above a page's `return` stay as they are; no file is moved or renamed that does not have to be; the bundles are written by one script that keeps key order and line endings. INT measures the drift from `master` at every wave boundary in a throwaway worktree (`git merge --no-commit --no-ff master`, then `--abort`) and reports the conflict list. Merging `master` in for real is the owner's call. | the repo is public and Krisz commits to `master` (D4). |
| R24 | **Record once, replay everywhere.** After the seed INT records every `/api` response the 59 states need, per account, into `.pulse/rec/`. Every equality proof — baseline, hybrid sweeps, package pairs, reviewer captures, the closing pixel compare — is a REPLAY: requests answered from the recording, the page clock set to the recording instant by CDP virtual time, a capture taken when no finite animation is running. The live backend is used for the recording itself, one hand-off smoke per package, the Gate A cross-check and the flow scripts of 7.2. No clock is pinned on the server and the database is never re-seeded mid-effort. | the server decides "today" (`logs/routes.js:537-552`, `plans/schedule.js:28-39`, 104 sites); a browser-pinned clock only fixed the date label. |
| R25 | **Verification cannot write by accident.** The capture tool fails every non-GET `/api` request unless the state names it in a `writes` list, and a `writes` list may only target sandbox objects (2.5). Requests a page fires on opening (`/notifications` mark-read, chat read receipt) are answered by a declared stub and never reach the server. | the plan editor, the diet editor and the compose editors write on every tap; "open, never save" was not a rule those screens can follow. |
| R26 | **A fixture is an edit of a recorded response**, written as a list of pointer-and-value changes over the recording of the same endpoint. `pulse-fixture-check` fails on a key, a type or an enum value no recording of that endpoint has. A frame verified on a fixture gets the verdict `matched-fixture`, never `matched`, and is listed in every report to the owner. | responses are not validated at run time (`lib/api.ts` returns `body as T`), so a free-hand fixture can draw anything. |
| R27 | **"Matches" is measured.** The boxes of every named layer and text node of the 59 frames are exported from Figma once (F0) into `frontend/scripts/pulse-geometry/<frame>.json`. Kit components carry `data-kit="<kit function name>"`. A probe compares the rendered boxes with the file (2 pt; ink-tight numerals 3 pt). Pairs are written as tiles of at most 874 pt (frame, app, difference) so an agent sees them at full resolution. | 30 of 59 frames are taller than the size the Read tool shows without downscaling; a tolerance nobody can measure is a look. |
| R28 | **INT works in its own worktree** (`tracker-wt/int`, branch `pulse-int`). The main checkout is the owner's live view and runs the one backend; it moves only by `git merge --ff-only pulse-int` to a commit that was built green. Reviewers build their own detached worktrees at the commit they review. | one tree cannot be a bench, an evidence source and a live preview at once. |
| R29 | **Lanes and packages reach foreign files the same way**: three hand-in files in `pkg/<id>/` — `i18n.patch.json`, `variants.json`, and for lanes `shared.patch` (a git-format patch of the foreign hunks: tokens, keyframes, script lines, a playground demo case). The file is committed on the branch; `pulse-sync` applies it in the slot; INT applies the same file at the merge. Nothing is re-typed from prose. | a lane cannot get a green build in its slot without `catalog.ts`, `tokens.css` or a `common.*` key changing. |
| R30 | **Gate exemption lists are data.** `UNTRANSLATED_BY_DESIGN`, `DORMANT` and the safe-area `EXEMPT` map move out of their scripts into `frontend/scripts/data/*.json` (F1.0, no rule change). The patch tools write those files; nobody but F2 edits a gate script. | `check:i18n` fails in both directions on its exemption list; a slot could not go green without it. |
| R31 | Tools never re-implement a gate's rule. `pulse-i18n` imports the consumer scan of `check-i18n.mjs`, `pulse-variants` the reader scan of `check-element-roster.mjs`, `pulse-merge-check` the counter of `check-pulse.mjs`, and every tool the glob expander of `pulse-owns-check.mjs`. | a second implementation of a solved problem is this project's second defect class. |

### 1.2 Left to the owner — seven questions, each with a default, so nothing waits

Asked once, at the start, as option prompts in Hungarian (texts in `work-packages.json`, `ownerDecisions`),
Q7 together with its two pictures. An answer that differs from the default becomes an INT request and a note on
the affected packages; it never silently rewinds finished work.

| # | Question | Options | Recommended = default |
|---|---|---|---|
| Q1 | **The mannequin.** Of the 22 regions, 3 can be derived from pictures that exist; 14 follow grooves of the render and must be traced; 5 have no groove at all (front and side delts share one cap; neck front; adductors; abductors). | (a) neutral renders + regions traced by hand, no new image; regions without a reference picture are accepted only on a contact sheet he signs off; (b) the same, with one generated lit reference picture per region as a tracing aid (about 14-19 new generations — his tool, his credits; the pictures never ship); (c) wait for a new render whose panels match the 19-muscle roster; (d) keep the re-toned vector map for good | **(a)** — it spends nothing without his word. Until F15 lands, the seven frames that show the figure carry the verdict `pending-F15` and the screens show the existing map on Pulse tokens. |
| Q2 | **The coin store sells exactly two items, Aurora and Ember** (250 coins each), for a pack that can no longer be worn. | (a) hide a theme item the user does NOT own; an owned one stays as a non-purchasable row with the existing "Megvan" — so the store looks empty to everyone else until the backend package lands; (b) do the backend delisting + compensation package before the Coins screen ships; (c) leave them visible and purchasable | **(a)** now, and the backend package first on the list after this effort. (a) is a display filter, not a control: the server still sells to a forged request. |
| Q3 | **Style Studio.** With one Pulse look per element NO switch steers the product any more: all 27 elements end as "nem használt", and the frames `style-studio-1/2` (a live E1 with a lime pill) cannot be matched. | (a) accept it: the page is restyled, says so honestly, and the seven variant files only the playground uses are deleted (F20); (b) keep five letters, narrowed to motion and feedback, and re-author them (about 8 000 lines, XL+); (c) cut studio, playground, catalogue and gate | **(a)** — it is the default written in D1; (b) can be done later element by element. |
| Q4 | **When an approved frame and what the app does today disagree, which wins?** Cases: the sharing controls on Haladás (code: checkbox on purpose; frame: switch); the marketplace lead post (code: cover only; frame: title, coach, price); three toasts at once and Undo (frame: one line); Home on a rest day, a finished day, two sessions (frame: one subject); the admin row on Profil; **the desktop layouts of the admin and coach screens** (no frame is wider than 402 pt). | (a) behaviour wins: nothing a user can do today disappears, the look follows the frame as far as behaviour allows, every case is written to `docs/pipeline/pulse/deviations.md` for a ruling afterwards; (b) the frame wins and undrawn behaviour is cut (desktop: one 430 column everywhere); (c) ask each time | **(a)**. Already settled: Home and Profil follow their two pixel-approved frames for chrome (Profil is a tab root, no back arrow). |
| Q5 | **`/compose` and `/m` have no way in on a phone** (only the desktop Cmd+K palette links to them); six of the 24 redesigned screens sit behind them. | (a) stay reachable by URL only for now; (b) a row on the coach dashboard (`nav.compose`) and one in Profil (`nav.marketplace`); (c) both rows in Profil | **(a)** — a new door is a product decision. The gate keeps printing the two exemptions as open and every report marks the six screens "URL only". |
| Q6 | **Which tab is lit on Értesítések?** The frames draw none lit; the app's rule is one lit tab on every signed-in route. | (a) Kezdőlap (the bell lives there); (b) none, as drawn | **(a)** |
| Q7 | **The player on a small phone** (360 x 640, offline line showing): the drawn content is about 680 pt tall, the room is about 560 pt. What gives way first? Shown with two annotated crops of `workout-2`. | (a) the figure goes first, then the secondary meta line; the exercise name, the set target, the check control and the rest line never move; (b) the figure stays small and the set list scrolls inside its own area | **(a)** — written into the S-workout brief and `deviations.md`. |

Also shown to him with the questions, as a picture and not as a question: where Home's permanent library row
(D2) goes — a `ListRow` under the today block, labelled with the existing `nav.library` ("Gyakorlatok"). The
row is in no frame; it is masked when Home is compared with the approved frame.

### 1.3 For the owner's information (decided above, visible to him)

- "Megjelenés" and "Áttetsző felületek" disappear from Profil (R10, D1).
- Frame `workout-3` (empty player) is never built; `/workout` with no session opens the library (R15, D2).
- No "finish workout" control appears in this effort (D3); Home keeps saying "Edzés folyamatban" after the first start.
- Hybrid screens (everything not yet migrated) are **not to be judged as Pulse**. The list of migrated screens is in
  `progress.json` and in every milestone report.
- The frames `home-2` and `workout-1` were drawn on a Friday session. The demo seed anchors on the day it runs and
  has no date switch, and the server clock cannot be pinned without touching the backend (SQLite's `date('now')`
  ignores a JavaScript clock). So those two frames — like the approved `home-1`, which the seed can never reach —
  are verified on fixtures and reported as `matched-fixture`; Home is additionally checked live on a second
  account's real training day. If he wants them on real data, a freeze taken on a Friday does it (one extra sweep).
- Frames that are verified on a fixture, frames waiting for the mannequin (`pending-F15`) and screens reachable
  by URL only (Q5) are listed by name in every milestone report.
- The six marketplace, post and coach-profile frames are compared with a mask over the cover: the seeded covers
  are 320 x 180 placeholders, and the three sample covers are not uploaded to published posts.
- If he sees "too many attempts" when logging in while agents work, that is the shared login limit (R19); with
  the cookie jars it should not happen. One word from him switches the dev backend to `NODE_ENV=test` (limiters
  off, nothing else changes, no file edited); the plan does not do it on its own.
- All 49 image files are AI-generated and their usage terms are unchecked (Index, "Honest limits"). Nothing is
  pushed in this effort; the terms must be checked before the FIRST push. He is told again when the asset lane lands.

---

## 2. Operating model

### 2.1 Trees

| Tree | Path | Branch | Who | Runs |
|---|---|---|---|---|
| Main checkout | `C:/Users/Petike/Documents/Cursor/tracker` | `pulse-redesign` | the owner looks; INT only fast-forwards | the ONE backend (`:3000`, cwd `backend/`, `DB_POOL_THREADS=4`), the owner's dev server (`:5173`), seeds. **No build, no preview, no gate probe, no merge work.** After every green commit: `git merge --ff-only pulse-int` (and `npm ci` + a dev-server restart only when the lockfile changed). |
| Integration worktree | `C:/Users/Petike/Documents/Cursor/tracker-wt/int` | `pulse-int` | INT only | every step of 6.2, every sweep, `verify:gates`, `npm install`, every commit; preview on `:5189` |
| Base worktree | `C:/Users/Petike/Documents/Cursor/tracker-wt/base` | detached at `0860942` | INT / lane V | built once, served on `:5180` only while a baseline is captured; kept on disk as the "before" |
| Slot worktree | `C:/Users/Petike/Documents/Cursor/tracker-wt/slot-<n>` (n = 1..6) | `pulse/<package id>` (local, never pushed) | one agent at a time | its own `npm ci`, its own build, a preview on `518<n>` only for the seconds of a capture |
| Review worktree | `C:/Users/Petike/Documents/Cursor/tracker-wt/review-<n>` (n = 1..2) | detached at the commit under review | one reviewer | its own build, a preview on `5187` / `5188` |

- `pulse-redesign` is the published line: it always equals the last green commit of `pulse-int`. Slots merge
  from `pulse-redesign`; nobody but INT sees `pulse-int`.
- `.pulse/` (git-ignored) lives in the main checkout only and is reached from every tree by absolute path
  (the tools resolve it from `git rev-parse --git-common-dir`).
- A slot is a directory; a package is a branch. A slot is synced, resumed and re-used ONLY through
  `node scripts/pulse-sync.mjs <id>`:
  1. clear dead locks and a stray preview on the slot's own port;
  2. undo every local apply: `git restore --source=HEAD --worktree` on a fixed path list — the three bundles,
     `ui/feedback/catalog.ts`, `scripts/data/*.json`, and the files named by the package's own `shared.patch`
     (remembered in `<slot>/.pulse/applied.json`). This is the one written exception to the ban below, and
     only the tool does it;
  3. assert that `git status --porcelain` now shows owned paths only — otherwise stop and print the others;
  4. `git merge pulse-redesign` (re-use after a merge: `git switch -C pulse/<next id> pulse-redesign`);
  5. `npm ci` if `package-lock.json` changed;
  6. re-apply the package's COMMITTED hand-in files (`i18n.patch.json`, `variants.json`, `shared.patch`) and
     fail loudly, with status `blocked`, if one no longer applies.
  After step 2 the merge cannot meet a local change in a path INT writes. A conflict in an owned path means INT
  wrote a claimed file: stop and report, never resolve.
- A slot whose package is not merged is never re-used — its uncommitted files are that package's work.
- Worktrees live beside the repo, never under `%TEMP%`. F0 removes the stray worktree registered under the
  session temp dir (`…/scratchpad/pre-pull`, `234089b`) after checking it is clean. No junction or symlink to the
  main `node_modules` (removing a worktree would follow it).
- Build and capture lock: `.pulse/locks/slot-{1,2}.json`, each `{ pid, package, port, previewPid, heartbeat }`,
  heartbeat rewritten every 20 s. A lock whose pid is dead or whose heartbeat is older than 3 minutes is taken
  over. `pulse-verify` is the only way a build or a capture is started in a slot: it takes a lock, kills any
  listener on its own port first, and registers its preview's pid. A wait for a cookie or for the lock itself
  happens BEFORE a lock is held. INT does not fill an agent slot while free RAM is under 1.5 GB.
- Never in a slot: `npm install <pkg>`, any `backend/` script, `npm run verify:gates` / `verify:nav-gate`,
  `git push`, a merge INTO `pulse-redesign` or `pulse-int`, `git add -A`, `git stash`, `git checkout` /
  `restore` / `reset` of a path the agent does not own, a bare `npm run build` as evidence (it takes no lock —
  `pulse-verify` runs it).

### 2.2 Roles

| Role | Count | Writes | Never |
|---|---|---|---|
| INT (integrator) | exactly 1 | every shared file (2.3), the live progress file, every commit on `pulse-int`, the fast-forward of `pulse-redesign`, seeds, the freeze, dev servers | a screen package; a second INT in parallel |
| Lane agent (Phase 0) | up to 5 at once | the files granted to its lane (`work-packages.json`), `docs/pipeline/pulse/kit/<lane>.md`, its specimen `features/playground/kit/<lane>.tsx`, its hand-in folder `docs/pipeline/pulse/pkg/<lane id>/**` | another lane's file, a feature page, a shared singleton |
| Screen agent (Phase 1) | 3, then 4, then 6 | the `.tsx` files of its package + `docs/pipeline/pulse/pkg/<id>/**` | anything else — a need outside is a hand-in file or a request |
| Reviewer (Phase 2, rolling) | up to 2 during Phase 1, 3 after | `docs/pipeline/pulse/review/**` only | source |

### 2.3 Ownership

`work-packages.json` is the one source. `scripts/pulse-owns-check.mjs` (F4) proves on the real tree that no two
packages' `owns` overlap, that every file under `frontend/src` is owned, frozen or INT's, that every file a
package deletes is in its `owns`, and that every pre-claim edit names a later owner. The `files` list a
progress entry shows is GENERATED from it, never typed. (This file was checked the same way when the plan was
written; the script repeats it at F4's merge and inside every `pulse-merge-check`.)

| Paths | Owner |
|---|---|
| `frontend/src/ui/**`, `src/app/**`, `src/lib/**`, `src/i18n/**`, `src/assets/**`, `src/index.css`, `src/main.tsx`, `frontend/index.html`, `frontend/public/**`, `frontend/scripts/**` (with `scripts/data/**`), `frontend/package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `.gitignore`, `.claude/launch.json`, `features/playground/**`, `docs/pipeline/pulse/{progress.json,briefs/**,deviations.md,copy-to-approve.md,pkg/_int/**}` | INT. In Phase 0 a lane is granted a sub-list in `work-packages.json`; `pulse-merge-check` enforces it. |
| `frontend/src/features/**/use*.ts`, `features/workout/{cues,intervalPlan,wakeLock}.ts`, `features/compose/{useAutosave,kindIcons}.ts`, `src/lib/outbox.ts` | **frozen for everybody** (three gates mirror or import them) |
| `backend/**` | nobody in this effort |
| the `.tsx` files listed for a package (section 4.2), `docs/pipeline/pulse/pkg/<id>/**` | that package's agent |

An edit a lane or package needs in a file it does not own is never made by hand in two places. It travels as a
hand-in file (4.4): the agent commits the FILE, the tool applies it in the slot, INT applies the same file in
the merge commit. Pre-claim edits — INT changing a file before the lane or package that will own it has started
(F1.0, F1.1, F1.4's codemod, F16) — are listed per file in `work-packages.json` (`preClaim`).

### 2.4 Commits (D4)

One squash commit per finished step, lane stage or package on `pulse-int`, fast-forwarded to `pulse-redesign`,
message `pulse(<id>): <what changed for the user>`, ending with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never touch `master`. Work-in-progress
commits on `pulse/<id>` are encouraged — they are what a resumed agent continues from.

### 2.5 Data: the freeze, the accounts, the sandbox

Accounts (all `@tracker.local`): M `user@`, C `coach@`, A `admin@`, N `demo.nagy.balazs@`,
R `demo.coach.szilagyi.reka@`, K `demo.kovacs.eszter@`, T `demo.toth.reka@`.

**The freeze** (INT, once, right after the capture tool merges — step F3.D in 3.3):

1. Seed (`seed:dev-users`, `seed:demo`) on a day on which M's plan has a training day: after the seed,
   `GET /my-plans/today` for M must say `source: "plan"`. If it says `freestyle` (a rest day — Sunday
   2026-10-11 is one), the seed is repeated the next day; nothing else waits for it.
2. Create the sandbox objects through the app's own API (`scripts/pulse-sandbox.mjs`; ids into
   `.pulse/sandbox.json`): a scratch template plan with days and exercises, a scratch plan with NO days, a
   scratch draft post with one of the three sample covers uploaded (a draft, never published), an interval plan
   assigned to T. K is the client for diet and equipment writes; T is the member for sessions, food and
   measurements.
3. Backend stopped: `cp data/app.db data/app.pulse-baseline.db`.
4. Record: `pulse-shot --record --all` walks the 59 frame states per account and stores every `/api` response
   (any content type) under `.pulse/rec/<account>/`, keyed by method, path and query, with the instant of the
   recording. `Set-Cookie` and `Authorization` headers are dropped: the store holds no credential, is
   git-ignored and never leaves this machine. The store is append-only: a state that later needs a GET nobody recorded gets it with
   `--record --only-missing` (GET only; any agent may run it, the entry carries its own instant); re-recording
   an existing entry is INT's and invalidates the baseline.
5. Baseline: all 59 states + inventories, in replay, from the base worktree into `.pulse/baseline/`.

| What | Replay (the default) | Live |
|---|---|---|
| Used for | baseline, hybrid sweeps, package frames and pairs, extra states, reviewer captures, the closing pixel compare | the recording; one hand-off smoke per package (each frame's base state — proves the code against the real API, claims no pixel equality); the Gate A cross-check; the flow scripts of 7.2 |
| Backend, login | none | the one backend; the account's cookie jar (R19) |
| Clock | CDP virtual time, started at the recording instant, advanced by the script (`advance: <ms>`) — rest and interval timers are reachable and repeatable | real |
| A request with no recording | fails the capture and is reported `unrecorded` | — |
| A non-GET request | answered only by a fixture of the state (a mutation outcome: 200, 409, 500), else failed | failed, unless the state's `writes` list names it AND its target is a sandbox object |

---

## 3. Phase 0 — foundation

### 3.1 Order

```
0.0  prep (F0)                           INT alone                         docs + data only
0.1  the switch (F1.0-F1.5)  ||  the net INT serial  ||  4 lanes parallel  the app turns hybrid   <- the one deliberate visual break
     the freeze (F3.D), then the hybrid sweep (F1.6)
0.2  kit stage 1 + shell                 1 keystone, then 5 lanes          what Home and Auth need
     ---- stage-1 acceptance (F17) ----> wave 1 starts: Home, Auth
0.3  kit stage 2 + mannequin stage 0     5 lanes, beside wave 1
     ---- foundation acceptance (F18) -> Profil may finish; the fan-out opens when Home is also reviewed
```

Sequential, and why: the switch (F1) rewrites `tokens.css`, `index.css`, `index.html`, `package.json`, `cn.ts`
and the three bundles, runs `npm install` and one codemod — one writer, seven commits. The keystone
(`control.ts`, F6) is composed by every other component — it lands before the lanes that use it. Everything else
is parallel because no two lanes own the same file.

**Buildable after each step: yes, always.** There is no red window in the history: every commit on `pulse-int`
is built green before it is made, and `pulse-redesign` only fast-forwards to such commits. The one deliberate
discontinuity is VISUAL — after 0.1 the whole app is hybrid until each screen's package lands. A slot worktree
may be red while its agent is mid-edit; that is what the worktree is for.

### 3.2 Step 0.0 — prep (INT, serial, no product source change) — package F0

1. In the main checkout, once: commit `docs/pipeline/pulse/**` on `pulse-redesign` (a worktree only sees tracked
   files) with `.pulse/` added to `.gitignore`. Create `pulse-int` at that commit and the integration worktree
   (`npm ci` there). From here on the main checkout only fast-forwards. Remove the stray temp worktree (2.1).
2. Export the frame geometry from the Figma file, once: for each of the 59 frames, every named layer and text
   node with its box relative to the frame -> `frontend/scripts/pulse-geometry/<frame>.json` (R27). Text nodes
   are named by their own string in the kit (`app-kit.src.js:22`), so most boxes map to the DOM by content.
3. Archive the asset production folder from the session temp dir to
   `C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepek-forras/` (it exists nowhere else — assets note §2.5).
4. Create the base worktree at `0860942`, `npm ci`, `npm run build` there.
5. Write `.pulse/progress.live.json` (one entry per package of `work-packages.json`, `files` generated) and one
   `briefs/<id>.md` per package.
6. Record the 11 baseline gate outputs, and — for the ratchet's later self-check — an independent count of each
   legacy construct taken with plain `git grep -c` (surfaces, the ten legacy type classes, variant literals
   inside `variant` attributes AND expressions, raw form controls, bridged `var()` names).
7. Ask Q1-Q7 (Q7 with its two annotated crops, and the picture of where Home's library row goes). Ask for
   keep-awake.

The seed and the database copy are NOT here any more: they belong to the freeze (2.5), which needs the capture
tool.

### 3.3 Step 0.1 — the switch (INT) beside the net (4 lanes)

**F1 — the value switch, seven commits, each green** (detail: safe §2.2; token values: safe §2.3, adopted verbatim)

| # | Commit | After it |
|---|---|---|
| F1.0 | Gate data out of the scripts (R30): `scripts/data/i18n-untranslated.json`, `elements-dormant.json`, `safe-area-exempt.json`, read by `check-i18n`, `check-element-roster`, `check-safe-area`. No rule changes; the three gate outputs are byte-identical before and after. The four lanes branch AFTER this commit. | nothing visible |
| F1.1 | Remove the client theme engine: `ui/theme/*`, `features/settings/{ThemeStudio,useThemeSync,AccentPicker,GradientBuilder}`, the `TransparencyChoice` block and the `<ThemeStudio />` mount in `SettingsPage.tsx`, the provider mount in `app/providers.tsx`, the pre-paint script in `index.html`, about 20 keys in three bundles and the four `settings.themePack.*` exemption entries. | plain Midnight for everyone; nothing reads `localStorage['tracker.theme']` or calls `GET /me/theme` |
| F1.2 | Fonts installed, dormant: three packages, `ui/tokens/fonts.css`, imported from `index.css`; no family token points at them yet. **The glyph check runs here**, on a scratch page outside `src`, with plain headless Chrome (`--dump-dom`; the capture tool is not needed): per face `document.fonts.check`, the canvas width of ő ű Ő Ű against the fallback-only width (equal = glyph missing), and equal advance of the ten digits under `tabular-nums`. | no visual change; the result is in the live progress file |
| F1.3 | Colour, radius and bridge tokens + canvas: one `:root` block; six pack blocks and three glass-fallback blocks deleted; new `--edge`, `--track`, `--radius-bar`, component metrics, shell tokens ADDED beside the old; legacy names per R2; `theme-color` and both manifest colours -> `#0B0D0A`; `sw.js` cache key bumped; `public/icons.svg` deleted. One empty, named block per lane is left in `tokens.css` and in `index.css` (`/* lane:F8 */ … /* /lane:F8 */`), so two lanes' patches never touch neighbouring lines. No layout metric changes (`--nav-h`, `--content-pad-b`, `--control-h` keep their values). | black, lime, hairlines; cards invisible but still padding; old fonts. The asset lane merges right after. |
| F1.4 | Type ramp and families: 16 Pulse steps + 10 legacy steps (R3) in `tokens.css` and `TYPE_STEPS` in the same commit; the codemod that renames the 152 `text-body` / `text-display` / `text-micro` sites to their `-legacy` names (a pre-claim edit in up to 82 files, purely mechanical, checked by `git diff --stat` showing only those class tokens); the three family tokens; the `type-binding` block; `h1, h2, h3` out of the display rule; Inter and Space Grotesk removed; preload. Not made unless the F1.2 glyph check passed. | Pulse type wherever the Pulse role names are used; no existing text changes size; `check:type-scale` prints 26 steps |
| F1.5 | Gutter: `.screen-x` 24 px, 16 px below 376 px, both safe-area `max()` forms kept. | left edge at 24 |
| F1.6 | Hybrid sweep (no commit unless a fix is needed), after the freeze: all 59 states of the built app, in replay, against the baseline. Pass = no undeclared console error or failed request, no horizontal overflow at 360 / 402 / 430, control inventory equal to the baseline except the removed theme UI; the same for the 1280 px baseline of the six desktop files. Fixes go into tokens, never into feature files. Stored as `.pulse/hybrid/`. | recorded in the progress file |

If the glyph check fails: the display face is replaced by its successor family `@fontsource-variable/big-shoulders`
(same publisher, same version) and checked again; if Geist or Geist Mono fails, F1.4 is not made, the app stays
on the old fonts over the new colours (a valid hybrid) and the owner is asked. If a Hungarian session downloads
more than 150 KB of fonts, nothing is cut silently: the number and the per-file table go to the owner (today's
build ships 307 kB, so no state of this plan is worse than today).

The token block in five lines (the full table is safe §2.3): surfaces `#0B0D0A` / `#141712` / `#1E2219` /
`#2A2F24`; text `#F2F5EA` / `#A9B09D` / `#858C79`; accent `#CBFF2E` with `--accent-fg: var(--surface-0)`;
`--edge` = ink 36 %, `--track` = white 10 %, hairlines white 8 % / 14 %, scrim black 60 %; radii button and chip
full, sheet 28, field 0, card 2, bar 1. Type: `giant` 124/108/900 · `num` 48/48/900 · `display-xl` 48 ·
`display` 32/34/700 · `eyebrow` 16/20/700 upper · `title` 22/28/600 · `body` / `body-m` / `body-b` 16/22 ·
`cap` / `cap-m` 13/18 · `tab` / `tab-on` 11/14 · `data-l` 16/20 mono · `data` 13/18 mono · `micro` 11/16 mono
upper. Display face: `giant num display-xl display eyebrow`; mono: `data-l data micro`.

**The four lanes that run beside the switch** (file-disjoint from F1 and from each other; each has a hand-in
folder `pkg/<lane id>/` for the foreign lines it needs — `package.json` script lines, a `navTabs.ts` data line)

| Lane | Package | Work | Merge constraint |
|---|---|---|---|
| G — gates | F2 | three merges. **G-a**: `check-type-scale` gets the family-binding leg (it keeps requiring plain lengths; nothing is widened); NEW `check:canvas`. **G-b**: `check-safe-area`, `check-nav`, `check-nav-active`, `check-element-roster` as specified in 3.6; the stale anchor of `verify-nav-gate.mjs` fixed; NEW `verify:gates` (a serial probe runner that plants one defect at a time, expects the named failure, restores byte for byte, and prints its anchored files with `--list-anchors`). **G-c**: NEW `check:pulse` (the ratchet, 3.6) | G-a before F1.3; G-b any time; G-c after F1.5 and before any lane of 0.2 — INT generates the budgets in that merge commit with `check-pulse --init` on the merged tree (the F1.4 codemod is the last commit allowed to raise a count) |
| V — eyes | F3 | `pulse-shot.mjs` (headless Chrome over raw CDP, no npm dependency), `pulse-verify.mjs`, `pulse-frames.json`, `pulse-sandbox.mjs`, `scripts/dev-stack.mjs` — the full specification is 6.0. Then, with INT, the freeze (F3.D, 2.5) and the BASELINE: all 59 states + inventories in replay from the base worktree, plus a 1280 px capture + inventory of the screens that use `col-wide` or `lg:` | the freeze and the baseline before F1.6 |
| T — integration tools | F4 | `pulse-owns-check.mjs`, `pulse-merge-check.mjs`, `pulse-sync.mjs`, `pulse-i18n.mjs` (`check` / `apply` / `revert`), `pulse-variants.mjs` (`check` / `apply` / `revert`), `pulse-fixture-check.mjs`, `pulse-progress.mjs` (`sync`, `claim`, `snapshot`, `report`), `pulse-ledger.mjs` (the source ledger of ruling 19, which also counts `focus-visible:`, `useMotionSafe(` and `motion-reduce:`) | before any lane of 0.2 |
| E — assets | F5 | `assets-src/pulse/assets.json` (the slot table, canvas `#0B0D0A`, accent, knee 32), `scripts/build-pulse-assets.mjs`, the 49 WebP files, `slots.ts` / `urls.ts` / `index.ts`, NEW `check:assets` (8 assertions + probes), `ui/media/Pic.tsx`, `ui/media/UserPhoto.tsx` | after F1.3 (the baked canvas must equal `--surface-0`) |

What ships in lane E (R7): 14 tab icons (one 96 px file each), `coin` (72 / 188 / 376 / 512), `medal` and
`medal-active` (168), 8 equipment stills (144), `figure-front` and `figure-back` (195 / 390 / 585), 7 heroes at
1x and 2x, `texture-monogram` (512) — 35 sources, 49 files; the manifest is the list and `check:assets` compares
it with the folder. What must NOT ship: the five superseded steel `tab-*` masters, the four baked lit figures
(`muscle-figure-front`, `figure-front-press`, `figure-front-legs`, `figure-back-lats`), `figure-back-pull`, the
three sample covers, `portrait-coach` — an excluded name in the manifest fails the gate. `sharp` is not a
frontend dependency and a worktree has no `backend/node_modules`: the export script takes `--sharp-from <a
checkout that has backend/node_modules>` (default: the main checkout, resolved from the git common dir) and
`--src <absolute source folder>`, and says so plainly when either is missing. Reading a module from there is
not running a backend script. `check:assets` itself needs no `sharp`, so slot builds are unaffected.

The mannequin lane (F15) starts its region research here, in the background.

Exit of 0.1: the build is green with the new gates in the chain; `verify:gates` shows every planted defect
turning its gate red and the tree restored (`git status` clean); the freeze exists; `.pulse/baseline/` holds a
capture and an inventory for all 59 states, and an agent that did not build the capture tool has checked a
contact sheet of the 59 against the frame names (every sub-state really is the sub-state); the hybrid sweep
passes; the stale-theme proof passes (a browser with an old `tracker.theme` and the `aurora` account `user@`
render plain Pulse).

### 3.4 Steps 0.2 and 0.3 — the kit and the shell

Rules for every lane: R5, R6 and R29. A variant read that stops steering is handed in as `variants.json`
(`{element, live:false, reason}`) by the lane that owns the file with the read. A token, a keyframe, a
`package.json` line or a playground demo case the lane needs travels in its `shared.patch`, written inside the
lane's own named block where one exists; a `common.*` / `nav.*` string in its `i18n.patch.json`. Never a local
literal. Each lane adds its specimens to `features/playground/kit/<lane>.tsx`, which the kit host collects with
`import.meta.glob`, and gives every kit component its `data-kit` name (R27). Specimens show rest, pressed,
disabled, busy AND keyboard focus.

| Lane (package) | Stage 1 — step 0.2, blocks Home and Auth | Stage 2 — step 0.3, blocks the fan-out | Files (exclusive) |
|---|---|---|---|
| A1 actions — keystone (F6), alone, first | `control()`: lime pill, `size` axis (R4), `link` variant with `tone="danger"`, bare icon shape, pressed, disabled and focus-visible states; `Pressable` three-dot busy; `TextLink` | — | `ui/primitives/{control.ts,Pressable.tsx,TextLink.tsx}` |
| KIT host (F7, INT, same moment) | `features/playground/PulseKit.tsx` as the first section of `/playground`, with a two-state control "list / board": the board lays the specimens out as the Figma boards do (1300 wide, three 354 columns, the order of `app-components.body.js`), so a capture at 1300 x H, scale 1, can be tiled against `_components-1..4.png`; delete `ui/TokenProof.tsx`; `CURATED.E21` -> `'A'` | — | `features/playground/{PulseKit,PlaygroundPage}.tsx`, `ui/TokenProof.tsx`, `ui/feedback/ElementStyleProvider.tsx`, `ui/feedback/catalog.ts` |
| SEL selection (F8) | `BadgeCount`; `Segmented` in the two Pulse forms (hug, equal cells; radiogroup + roving tabindex + async layer kept); `LanguageToggle` | `ChipRow` (single, multi, wrap, lime mark); `Toggle` rebuilt on it (`role="checkbox"` kept); `Switch` 48 x 28 (`role="switch"` kept); `CheckMark`; `CopyButton` skin. Deltas E6, E2 | `ui/primitives/{BadgeCount,ChipRow,Toggle,Switch,CheckMark}.tsx`, `ui/nav/LanguageToggle.tsx`, `ui/feedback/variants/{E6Segmented,E2CopyButton}.tsx` |
| ST structure (F9) | `SectionHeader` rewritten (strong rule -> eyebrow + one trailing node); `Rule`; `RowStack` + `ListRow`; `EmptyState` left-aligned; `Skeleton` base; `NoticeLine` | `Monogram` 28 / 64 / 176 (texture over an ink fallback, optional dot) | `ui/data/{SectionHeader,Rule,RowStack,ListRow,Monogram}.tsx`, `ui/feedback/{EmptyState,ScreenSkeleton,NoticeLine}.tsx` |
| DA data (F10) | `Numeral`, `Fraction`, `StatBlock` (ink-tight through `text-box-trim` with per-face fallback offsets as tokens); `SegmentBar`; `MacroColumns`; `ProgressBar`; `CountUp` as the digit roller. **One size mechanism for the giant numeral**: the element carries `text-giant` and the fluid size is an inline style (`fontSize: 'var(--giant-fluid)'`), never a second `text-*` class — `tailwind-merge` would drop `text-giant` and with it the line-height, weight and family binding (`cn.ts:26-55`) | `LedgerRow` (failed = "—", never 0); `Stepper` | `ui/data/{Numeral,StatBlock,LedgerRow,SegmentBar,ProgressBar,MacroColumns}.tsx`, `ui/feedback/CountUp.tsx` |
| SH1 shell (F11) | tab bar (R12: no surface, equal cells, inset 10 / 12 / 8 and icon 32 / 32 / 28 by tab count, sentence-case labels, bottom fade, one `isTabActive` expression for the lit state and `aria-current`); `Screen` scaffold (top inset, status-bar mask, `overflow-x: clip`); `ScreenHeader` (`greet` / `root` / `push` / `section`) on `routeMeta.ts` (R13); `Dock`; `PublicLayout` as a layout route; lazy `HomePage` / `AuthPage` (the router's existing error handling stays; no new error screen is drawn). Delta E11 | — | `app/{navTabs.ts,routeMeta.ts,AppLayout.tsx,PublicLayout.tsx,router.tsx,RequireAuth.tsx}`, `ui/nav/BottomNav.tsx`, `ui/shell/{Screen,ScreenHeader,Dock}.tsx` |
| IN inputs + sheet (F12) | underline `Field` (label always rendered, `aria-describedby` kept, 16 px text, focus / error / disabled underlines) | `SearchField`, auto-growing `TextArea`, `NumberStepper`, `MaskedField`, `DateTrigger`, `SelectSheet`, `FilePick` (the heir of the two raw `type="file"` inputs), `FeedbackField` skin; the bottom `Sheet` (`surface-2`, top radius 28, hairline edge, token scrim, no blur, no shadow; contract kept); `ConfirmSheet`. Deltas E7, E14 | `ui/primitives/{Field,SearchField,TextArea,NumberStepper,MaskedField,DateTrigger,SelectSheet,FilePick}.tsx`, `ui/feedback/variants/{E7Field,E14E20}.tsx`, `ui/feedback/ConfirmSheet.tsx` |
| SH2 status zone (F13) | — | the toast band (R14); `OfflineIndicator` markup as a `warn` notice line; `CommandPalette` minimal restyle. Delta E15 | `ui/feedback/ToastHost.tsx`, `ui/feedback/variants/E12E16.tsx`, `ui/shell/{OfflineIndicator,CommandPalette}.tsx`, `app/providers.tsx` |
| CH charts (F14) | — | `TrendChart` (no area, hairline axes, 1.5 px line, one end dot, dotted gap, sr-only table kept, positions still from `chartGeometry.plot()`); `Sparkline` | `ui/feedback/{TrendChart,ProgressChart,Sparkline}.tsx`, `ui/feedback/chartGeometry.ts` |
| M1 mannequin (F15) | — | **stage 0, required by F18**: additive props `side` / `onSideChange` (controlled; uncontrolled stays the default), `sideControl="none"`, the figure in a fixed 597 : 1261 box. **Stage 1, own track (Q1)**: `regions.ts` and the new inside of `MuscleMap`; its acceptance is in 5.2 row 11 | `ui/muscle-map/**` |

The mapping "Pulse component -> code" is `primitives.md` §3 (25 rows); every row is in exactly one lane above.
Components with no Pulse heir (`Surface`, `SummaryTile`, `Gauge`, `DataTable`, `AuroraBackdrop`, the legacy
variants) are invisible or bridged now; the seven variant files only the playground imports
(`E1Button`, `E3IconButton`, `E4Toggle`, `E5Checkbox`, `E8E9`, `E10Tabs`, `E17E19`) belong to no lane, sit in
INT's budget (`pkg/_int/budget.json`) and are retired in F20; the rest is deleted in closing (F19).

INT's own commits in step 0.2, each a separate step (package F16):

- **SH1's merge commit** also carries, from F11's hand-in files: `--nav-h: 56px` and `--content-pad-b` re-valued
  (R12); `check:assets` assertion "every tab key has both rasters" switched on; the `routeMeta` assertions in
  `check-nav` and `check-nav-active`; `check-safe-area` "the scaffold uses a top-inset token"; the anchors of
  `verify-nav-gate.mjs` re-anchored; the E11 demo case of `PlaygroundPage.tsx`.
- **D2 redirect** (R15): `features/workout/WorkoutPlayer.tsx` (no-session branch, error state), two keys out of
  three bundles, `REQUIRED_DOORS` filled.
- **Aurora out** (R16): the eight remaining mount lines in `AuthPage`, `MarketplacePage`, `PostPage`,
  `CoachProfilePage`, the component, the three token declarations, `check:aurora` and its `build` entry.

These touch four feature files BEFORE any screen package claims them (pre-claim edits); INT lowers the budgets
of those packages in the same commits (`check-pulse --fix-down`), and the packages inherit the edits.

After EVERY lane merge INT runs, in the integration worktree: `pulse-merge-check` -> squash -> the lane's
hand-in files applied by the tools -> build -> preview -> the full hybrid sweep in replay (shared files changed)
with the lane's intended differences listed up front -> the kit board capture -> `verify:gates` whenever the
merge touches a gate or an anchored file (the merge check refuses to continue without it) -> commit ->
fast-forward `pulse-redesign`.

Agents at once in Phase 0: INT + 4 (step 0.1) -> INT + 1 (keystone) -> INT + 5 (stage 1) -> INT + up to 5 lanes
of stage 2 beside the first screen agents; the total of writers never exceeds 6 plus INT.

### 3.5 Acceptance

- **F17, stage-1 acceptance** (INT): the stage-1 rows of section 5.2. It opens wave 1 for Home and Auth.
- **F18, foundation acceptance** (INT + one reviewer that built none of it): all of section 5.2 except row 11.

### 3.6 Gates, re-pointed

| Gate | Change | Lands in | Probe (`verify:gates`) |
|---|---|---|---|
| `check:pulse` NEW | the ratchet; every rule has an id. Per file under `src` it counts: `<Surface`, `<SummaryTile`, `<Gauge`, `<AuroraBackdrop`; the TEN legacy type classes (R3); a `font-display` CLASS token in `.ts` / `.tsx` (never the CSS descriptor `font-display:`); `rounded-card`, `rounded-field`, bare or sized built-in `rounded-*`; `bg-*-subtle`, `text-on-*`, `border-*-border`, `(text\|bg\|border)-info*`, tile tint; the literals `secondary` / `ghost` / `danger` anywhere inside a `variant` attribute or property — string OR expression (`variant={on ? 'secondary' : 'ghost'}`); a `primary` that can reach an element with no `size`; a `<Pressable` with no variant, `chip(`; a `<Skeleton` carrying `rounded-*`; raw `<input>` (including `type="file"`) / `<textarea>` / `<select>` outside `src/ui`; `backdrop-blur`, `blur-`, `shadow-` other than the glow; `bg-surface-1` anywhere, `bg-surface-2/3` outside the allow-list; `bg-black` / `bg-white` / `text-black` / `text-white`; `var(--<bridged name>)`; `icon=` on `EmptyState` / `SectionHeader`. A "kept rules" leg asserts that `index.css` still holds the global `:focus-visible` ring and the reduced-motion backstop. **Budgets**: one file per lane and package, `docs/pipeline/pulse/pkg/<id>/budget.json`, holding exactly the files that id owns, plus `pkg/_int/budget.json` for everything INT keeps (the seven playground-only variant files, `Surface`, `SummaryTile`, `Gauge`, `DataTable`, `PlaygroundPage`, `coaching/Monogram`). They are GENERATED from `work-packages.json` by `--init` (INT, once, on the merged tree). count > budget fails; count < budget fails until the owner of that file lowers it (`--fix-down <id>`, can only lower); a counted file in no budget file fails; an all-zero or orphan entry fails until deleted. At G-c each rule's total must equal the independent count of F0 step 6, or the difference is explained in writing | F2 (G-c) | one planted defect PER RULE ID; a budget raised; a counted file removed from its budget; the focus rule deleted from `index.css` |
| `check:assets` NEW | 8 assertions (assets note §4.4 + one): among them "no `mix-blend-` in `src`", "every tab key has both rasters", "folder under 1.0 MB", "manifest slots = files on disk, no excluded source", and **`assets.json` accent = `--accent`** (R9) | F5 | delete one `-lit` file; add `mix-blend-lighten` to a feature file; change `--accent` alone |
| `check:canvas` NEW | `--surface-0` == `theme-color` == both manifest colours (the baked canvas of `assets.json` is held by `check:assets`) | F2 (G-a) | change one manifest colour |
| `check:type-scale` | plain lengths stay mandatory (the fluid giant is an inline style, so nothing is widened); third leg: the binding block covers exactly the steps declared display / mono / uppercase | F2 (G-a), mandatory from F1.4 | a step declared without a `cn.ts` entry; `.text-eyebrow` dropped from the binding; `--text-giant` written as `min(…)` |
| `check:safe-area` | an element is edge-pinned when it is `fixed` or `sticky` with `top-0`, `bottom-0`, `inset-0` or an arbitrary `top-[…]` / `bottom-[…]`; a token is inset-carrying when its value reaches `env(safe-area-inset-*)` **transitively through `var()`** in `tokens.css`; such a token satisfies the rule anywhere in the element's classes (`pt-` / `pb-`, `top-[…]`, `bottom-[…]`, inside `calc()`); a dead exemption fails; the scaffold must use a top-inset-carrying token (not a literal `env()`). Before G-b merges the rule is dry-run on a copy of `tokens.css` carrying F11's planned values — `ToastHost.tsx:149` (`pb-[var(--content-pad-b)]`) must stay green | F2 (G-b), F11 | the bottom inset removed from the bar; `--safe-b` re-declared without `env()`; `pb-[var(--card-pad)]` on a `fixed bottom-0` |
| `check:nav-active` | completeness against the router; `/notifications` -> Home (Q6 default); the owner of a pushed route owns its `routeMeta` parent | F2 (G-b), F11 | a route added with no row |
| `check:nav` | comment-stripped inset test; subtree door rule; the exemptions for `/compose` and `/m` carry `open: true` and are PRINTED on every run until Q5 closes them; `REQUIRED_DOORS` (`/library` from `WorkoutPlayer.tsx`); every `routeMeta` parent is a router path and its label key resolves in three bundles | F2 (G-b), F11, F16 | the existing cases (the fourth re-anchored); the `Navigate` deleted |
| `check:elements` | a read counts as LIVE only when the exported component that holds the `useElementVariant` call is imported by a file outside `features/playground` (export granularity: `E12E16.tsx` and `E14E20.tsx` each hold one product element and two playground-only ones). The 14 playground-only elements (E1, E3, E4, E5, E8, E9, E10, E12, E13, E16, E17, E18, E19, E20) become `live: false` + dormant "playground only" in the G-b merge commit — which is the truth today; the studio stops promising "minden felhasználónál érvényes lesz" for them | F2 (G-b) | E1 marked live; a product read marked dormant |
| `check:tokens` | no rule change now. In closing (F19 row 1) a `RETIRED_STEMS` list (`on`, `info`, and any stem that loses its last mapping) is added in the same commit: a colour utility on a retired stem always fails — otherwise `text-on-success` would pass while resolving to nothing | F19 | after row 1: `text-on-success` planted |
| `check:aurora` | retired in F16 together with the last mount, the component and its tokens | F16 | its heir's probe (`check:assets`) |
| `check:i18n`, `check:interval`, `check:autosave`, `verify:outbox` | no rule change; `check:i18n` and `check:elements` read their exemption lists from `scripts/data/` (F1.0) and export their scans for the tools (R31) | F1.0, F2 | one existing-behaviour probe each in `verify:gates` |
| `verify:gates` NEW (not in `build`) | refuses a dirty tree, takes a lock, restores in `finally`, restores a leftover `.probe-backup` on start. Anchors are whitespace-insensitive patterns (`/to="\/coins"/`), placed in INT files wherever a choice exists (E1, not E11). `--list-anchors` prints every anchored file; `pulse-merge-check` refuses a merge that touches one unless `verify:gates` ran green on the squashed tree | F2 (G-b) | — |

Anchors that must sit in package files, and are therefore written into those briefs as "keep this literal":
`to="/coins"` in `SettingsPage.tsx` (S-settings), `<Navigate to="/library" replace />` in `WorkoutPlayer.tsx`
(S-workout), the "Tervek" link in `CoachDashboard.tsx` (S-coach-dashboard). A broken anchor found at such a
merge is INT's fix in the same commit, never a send-back.

The `build` chain at the end of Phase 0: `check:tokens, check:pulse, check:i18n, check:nav, check:nav-active,
check:interval, check:elements, check:autosave, check:type-scale, check:canvas, check:assets, check:safe-area,
verify:outbox, tsc -b, vite build`.

---

## 4. Phase 1 — screens in parallel

### 4.1 Rules every package inherits

1. The unit of work is **"rewrite the render of each owned page against the kit; keep everything above the
   `return`"**. Routes, hooks, query keys, mutations, zod schemas and existing i18n keys do not change.
   16 276 lines of JSX in 49 files are rewritten; the 23 hook and logic files are not opened for writing.
2. A package writes its listed `.tsx` files and `docs/pipeline/pulse/pkg/<id>/**`. Nothing else, ever.
3. Must NOT touch: every INT path of 2.3, every frozen file, every other package's files, `backend/**`.
4. Six JSX files are imported across packages and keep their exported names and props: `chat/NotificationBell.tsx`
   (S-home), `chat/ChatPanel.tsx` (S-coach-chat), `marketplace/PublicChrome.tsx` + `DocRenderer.tsx`
   (S-public-pages), `playground/PlaygroundPage.tsx` (INT), `coaching/Monogram.tsx` (INT — deleted in closing,
   once S-coach-dashboard and S-client-detail-a use `ui/data/Monogram`).
5. Nothing of `understand/screens.md` §4 becomes a working path. No visible copy is invented (R22). No
   finish-workout control (D3). No new door except Home's library row (D2) — Q5 may add two. No URL state (R20).
6. Every door of `understand/screens.md` §1.4 that lives in an owned file survives; a brief that says "keep this
   literal" (3.6) means the JSX attribute stays greppable as written.
7. The FIRST act of a package, before a line of JSX changes: list its undrawn states in `pkg/<id>/states.json`
   — each with its account, its steps, an `arrived` assertion, the object it uses (4.7) and, where needed, its
   fixture or `writes` list — record any GET the freeze lacks (`--record --only-missing`), and capture the
   baseline + inventory of every state on the still-hybrid screen. Then look at the contact sheet of those
   baselines: a capture that did not arrive where its name says is fixed before anything is rewritten. A state
   that was never captured cannot be proven to have survived.
8. An agent that is blocked moves to its next state or frame and says so in its status file. It never builds a
   local copy of a shared component, a local `text-[…]` size, a `token-lint-disable`, or a raised budget.

Inputs common to all: `docs/brain/58-Pulse/Pulse System.md`, `figma-build/app-kit.js`, `Product gaps.md`,
`docs/pipeline/pulse/kit/*.md`, the screen's block in `understand/screens.md`, dev-verify §3.5 (differences not
to chase) and §7 (account + URL + steps per frame). Frames:
`C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x/<frame>@2x.png`; composition:
`figma-build/app/<frame>.body.js`; measured boxes: `frontend/scripts/pulse-geometry/<frame>.json`; sheet:
`osszesitok/<screen>.png`.

### 4.2 The packages (24 for the 24 screens)

Owns = files under `frontend/src/features/` (plus the package folder). Accounts as in 2.5. Inventory notes are
under `docs/brain/58-Pulse/`. "Namespaces" = where the package may ADD keys; what it may change or remove is
decided by consumers, not by prefix (4.4).

| ID | Screen (route) | Owns | Frames | Inventory | Namespaces | Acct | Size | Wave |
|---|---|---|---|---|---|---|---|---|
| S-home | Kezdőlap (`/`) | `home/{HomePage,WeekStrip,HomeNutrition}.tsx`, `chat/NotificationBell.tsx` | `home-1..3` + `_jovahagyott-v1-home` | `Feature inventory.md` (1) | `home` | M, N; live check on K | M | 1 |
| S-auth | Belépés, Regisztráció (`/login`, `/register`) | `auth/AuthPage.tsx` | `auth-1..2` | `Screens/auth.md` | `auth` | — | S | 1 |
| S-settings | Profil (`/settings`) | `settings/{SettingsPage,CueSettings,EquipmentSection}.tsx` | `settings-1..2` (without the pack rows) + `_jovahagyott-v1-profile` | `Feature inventory.md` (3) | `settings` | M, A | L | 1 |
| S-workout | Edzéslejátszó (`/workout`) | `workout/{WorkoutPlayer,SetRow,RestTimer,IntervalStage}.tsx` | `workout-1..2` (`workout-3` superseded by D2) | `Screens/workout.md` | `workout` | M replay; T live | XL, two runs | 2 |
| S-library | Gyakorlatok (`/library`) | `library/LibraryPage.tsx` | `library-1..3` | `Feature inventory.md` (2) | `library` | M | L | 2 |
| S-coach-plans | Edzéstervek (`/coach/plans`) | `plans/PlanListPage.tsx` | `coach-plans-1..2` | `Screens/coach-plans.md` | `plans` | C, R | S | 2 |
| S-nutrition | Étkezés (`/nutrition`) | `nutrition/{NutritionPage,NutritionCard,MacroBars}.tsx` (the last two are deleted) | `nutrition-1..2` | `Screens/nutrition.md` | `nutrition` | M replay; T live | M | 2 |
| S-progress | Haladás (`/progress`) | `progress/ProgressPage.tsx` | `progress-1..3` | `Screens/progress.md` | `progress` | M replay; T live | L | 2 |
| S-coach-chat | Csevegés (`/coach/clients/:id/chat`) | `chat/{ChatPage,ChatPanel}.tsx` | `coach-chat-1..2` | `Screens/coach-chat.md` | `chat` | C; K live | M | 2 |
| S-plan-editor | Tervszerkesztő (`/coach/plans/:id`) | `plans/PlanEditorPage.tsx` | `plan-editor-1..3` | `Screens/plan-editor.md` | `plans` | C; scratch plans live | XL | 2 |
| S-client-detail-a | Kliens adatlap — the page, Terv and Üzenetek tabs, equipment (`/coach/clients/:id`) | `coaching/{ClientDetailPage,PlanTab,ChatTab,ClientEquipmentCard}.tsx` | `client-detail-1` | `Screens/client-detail.md` | `coaching` | C; K live | L | 2 |
| S-client-detail-b | Kliens adatlap — Táplálkozás and Haladás tabs | `coaching/{NutritionTab,ProgressTab}.tsx` | `client-detail-2..3` | `Screens/client-detail.md` | `coaching` | C; K live | L | 2 |
| S-exercise-detail | Gyakorlat részletei (`/library/:id`) | `library/{ExerciseDetailPage,SectionBadge}.tsx` (the last is deleted) | `exercise-detail-1..2` | `Screens/exercise-detail.md` | `library` | M | M | 3 |
| S-coins | Érmék (`/coins`) | `coins/{CoinsPage,CoinBalance}.tsx` | `coins-1..3` | `Screens/coins.md` | `coins`, `achievement` | M | M | 3 |
| S-notifications | Értesítések (`/notifications`) | `chat/NotificationsPage.tsx` | `notifications-1..2` | `Screens/notifications.md` | `notifications` | N | S | 3 |
| S-onboarding | Onboarding (`/onboarding`) | `onboarding/OnboardingPage.tsx` | `onboarding-1..3` | `Screens/onboarding.md` | `onboarding` | C | L | 3 |
| S-coach-dashboard | Edzői kezdőlap (`/coach`) | `coaching/CoachDashboard.tsx` | `coach-dashboard-1..3` | `Screens/coach-dashboard.md` | `coaching` | C | L | 3 |
| S-compose-hub | Piactéri pult (`/compose`) | `compose/ComposePage.tsx` | `compose-hub-1..2` | `Screens/compose-hub.md` | `compose` | C | L | 3 |
| S-public-pages | Poszt részletei (`/m/p/:publicId`) + Edzői profil (`/m/c/:handle`) | `marketplace/{PublicChrome,DocRenderer,PostPage,CoachProfilePage}.tsx` | `post-detail-1..2`, `post-detail-3` (the `DocRenderer` spec, not a screen), `coach-profile-1..2` | `Screens/post-detail.md`, `Screens/coach-profile.md` | `public`, `marketplace` | — | L | 3 |
| S-admin | Admin áttekintés (`/admin`) | `admin/{AdminPage,AdminShell,UserSearch,ModerationQueue,MarketplaceQueue,AdminMetrics}.tsx` (the last is deleted) | `admin-1..3` | `Screens/admin.md` | `admin`, `adminUsers` | A | L | 3 |
| S-compose-post | Poszt szerkesztő (`/compose/posts/:publicId`) | `compose/PostEditorPage.tsx` | `compose-post-1..2` | `Screens/compose-post.md` | `compose` | C; scratch draft live | L | 4 |
| S-compose-profile | Edzői profil szerkesztő (`/compose/profile`) | `compose/{ProfileEditorPage,HandleField}.tsx` | `compose-profile-1..2` | `Screens/compose-profile.md` | `compose` | C | L | 4 |
| S-marketplace | Piactér (`/m`) | `marketplace/MarketplacePage.tsx` | `marketplace-1..2` | `Screens/marketplace.md` | `marketplace` | — | M | 4 |
| S-style-studio | Elem-stílus stúdió (`/admin/styles`) | `admin/StyleStudioPage.tsx` | `style-studio-1..2` | `Screens/style-studio.md` | `studio` | A | M | 4 |

Dependencies: wave 1 needs F17 (S-settings also stage 2 of F8, F9, F10 and F14). Every later package needs F18
(which includes the mannequin's stage 0) and S-home merged and reviewed. S-plan-editor after S-coach-plans
(status vocabulary and plan rows are settled once, in the small package). S-client-detail-a after S-coach-chat
(it embeds `ChatPanel`); S-client-detail-b after -a (a tab body is judged inside the finished page).
S-compose-profile and S-marketplace after S-public-pages (`DocRenderer`, `PublicChrome`). S-style-studio after
S-admin and F20, queued last. The mannequin's stage 1 (F15) is optional for S-workout, S-library and
S-exercise-detail: they ship with the re-toned map in the fixed box, their seven figure frames are
`pending-F15`, and they change by themselves when F15 lands.

Where two packages add keys to one namespace (`library`, `coaching`, `plans`, `compose`, `marketplace`) the
i18n tool refuses a key that a patch on another branch tip also touches.

### 4.3 Musts that are easy to lose (each is a line in the package's brief and in its definition of done)

| Package | Must keep / must do / must not do |
|---|---|
| S-home | Keep `navigate('/library')`, both `/workout` links, the `/nutrition` link and the bell -> `/notifications`. Add the permanent library row (D2): a `ListRow` under the today block, label `nav.library` (the default shown to the owner; masked when comparing with the approved frame). Rest day, finished day, several sessions, week-query retry: composed from the kit (Q4 default); a failed week read prints "—" + `Újra`, never 0. `home-1` (the approved frame) and `home-2` are fixture frames (`matched-fixture`, 1.3); `home-3` is N on the recording. Gate A adds a LIVE check: Home as K on one of her training days must show a real "Indítás" state. `NotificationBell` keeps its export and props. |
| S-auth | `PublicLayout` + `Dock`. `react-hook-form` + zod, every error state and the language switch survive. Captured signed out (the 401 on `/auth/me` is a declared request, not an error); the register form is never submitted live (5 registrations / 15 min per IP, and it creates accounts) — its outcomes come from fixtures. |
| S-settings | Three new reads through the existing hooks `coins/useCoins` and `progress/useProgress` (import, never edit); a failed read prints "—". No "Megjelenés". The `/coins` row and the admin row (`/admin`'s second door) stay; **keep `to="/coins"` as a literal attribute** (a gate probe anchors on it). A tab root: no back arrow. |
| S-workout | One package, planned as TWO RUNS with a WIP commit between: run 1 = `WorkoutPlayer` + `SetRow` + the in-flow `RestTimer` (frames, the law); run 2 = `IntervalStage` (its 8 sub-states), failed-check `Újra` / `Visszavonás`, the withdrawn row, the stand-in hero. The one-viewport law: re-derive the height budget (`WorkoutPlayer.tsx:50-86`) and probe that the active check control's bottom is inside `innerHeight − --content-pad-b` at 402 x 874 and 360 x 640, with and without the offline line; what gives way at 360 x 640 is the Q7 default, not the agent's choice. `workout-2` (record + rest) and every interval state are fixtures edited from recordings, including the `POST …/check` answer, and the timers are driven by virtual time. Live smoke on T only (its interval plan is a sandbox object) — never on M or K. **Keep `<Navigate to="/library" replace />` literal** and the error state from F16. E21 / E22: one Pulse look, tap behaviour -> `variants.json`. The side switch and the legend are drawn by the screen (kit `Segmented`, `sideControl="none"`). Only `/sets/:id/check` and `/void` stay queueable. |
| S-library | The side switch and the legend are drawn by the screen through `side` / `onSideChange` (F15 stage 0); no other `MuscleMap` prop is assumed. Text-only rows (the list API has no equipment key) — no placeholder squares. `FeedbackField` -> `SearchField` (no variant delta: E7 belongs to F12). `t('muscleMap.filterHint')` gets a literal consumer here; the key exists, so no patch is needed, and the `muscle` / `muscleMap` namespaces are F15's. |
| S-exercise-detail | Equipment stills only through `EQUIPMENT_STILL`; `null` -> the name alone. The side switch as in S-library. |
| S-nutrition | `kcal` / `g` / `/` literals become keys; a date trigger over the native picker; no new error or undo states. All frames on M in replay; logging food happens live on T only. |
| S-progress | `progress-2` is seed-only: the default view is the two empty sentences. Sharing controls keep their code semantics (Q4 default). Photo delete keeps its sheet. The hand-rolled tab strip and the local toggle move onto the shared components; the raw file input becomes `FilePick`. Adding a measurement happens live on T only. |
| S-coins | Q2 default: a `theme.*` item the user does not own is not listed; an owned one stays as a non-purchasable row with `coins.owned`; with nothing to list, `coins.storeEmptyTitle` — display only, the purchase flow is untouched. The arc and the two tiles are not drawn (no honest data). E25 / E26 -> `variants.json`. Statement reasons stay as the server sends them. |
| S-notifications | The bar lights Home (Q6 default). No invented sender names or message bodies. Opening the page fires a mark-read POST: in capture it is answered by a declared stub and never reaches the server, so `notifications-1` needs no special account. |
| S-onboarding | No inbound link is added. Autosave draft, five steps and the required-field refusal survive. Sticky footer through `Dock`. `-2` / `-3` by fixture. |
| S-coach-dashboard | **Keep the "Tervek" link** (door to `/coach/plans`, a probe anchor) and the bell. Four sheets on the Pulse `Sheet`. Revoke and block keep today's one-tap behaviour (a confirm would be new behaviour). `CopyButton` is used as is (E2 belongs to F8). Minting a code is never done live: `coach-dashboard-2` is the mutation-outcome fixture of that POST. The desktop layout it has today stays (R21). |
| S-coach-chat | `ChatPanel` exports and props frozen. No bubbles; the composer through `Dock`. The read-receipt POST is stubbed in capture; a message is sent live only in K's conversation. |
| S-coach-plans | The status vocabulary and the plan row are settled here, before the editor starts. `coach-plans-2` (empty) is R. |
| S-plan-editor | All ten mutations, reorder, undo toasts, offline-disabled controls, the status sheet and the no-days empty state survive. No date field is invented. **Which object each state uses is written in the brief**: the three frames = the member's own plan, replay only, never written; every mutating state (add, clone, copy, delete + Undo, reorder, rename, status) = the scratch template plan, live; the empty state = the zero-day scratch plan; offline-disabled and Undo timing = CDP offline + virtual time. |
| S-client-detail-a | "Edzés / 28 nap": read through the existing `useClients()` hook in the page (import, never edit), so a deep link and in-app navigation show the same number; "—" only while it loads or fails, never 0. `ChatTab`'s link is the ONLY door to the chat route. The undrawn Üzenetek tab is composed from `ChatPanel`. The account state on the monogram dot gets an accessible label. Locale defects stay 1:1. Frames on M's link, replay only; equipment save (it notifies the client) live on K only. The desktop layout stays (R21). |
| S-client-detail-b | The diet editor writes on every tap (`NutritionTab.tsx:131-262`): frames on M's link in replay; add day / meal / item, delete and activate live on K only. Haladás shows what the client shares and nothing else. |
| S-compose-hub, -post, -profile | `useAutosave.ts` is not opened (eight lines are mirrored by a gate). The "Esemény" chip is drawn and no date field added. The hub's gate states (removed, guidelines, too new) are composed from `NoticeLine`. The post editor works on the scratch draft post, live (it has a cover, so `compose-post-1` can be matched, not only structured); its autosave line (saving / failed / "Mentve HH:MM"), the stale-save sheet (409) and the read-only state are mutation-outcome fixtures; the cover input becomes `FilePick`. The profile editor has no sandbox twin: its frames are replay on C, its save states fixtures, nothing is written live. Never publish or withdraw. |
| S-public-pages | Public routes never read the session to draw chrome. `DocRenderer` follows `post-detail-3`; its and `PublicChrome`'s exports and props are frozen. Covers through `UserPhoto`; the cover area is masked in the comparison (1.3). |
| S-marketplace | Lead post: cover only (Q4 default); cover masked. In replay the public read budget (240 requests / 15 min per IP) is not touched. |
| S-admin | Keep the "Stílus stúdió" link (the only door to `/admin/styles`). Delete `AdminMetrics.tsx` and its 14 keys — the `adminMetrics.clock.utc` exemption entry goes with them, by the tool. The account list becomes two-line rows built from `ListRow`. The undrawn Piactér tab follows the moderation grammar. The desktop layout stays (R21). Approve / reject are never fired live: their outcomes are fixtures. |
| S-style-studio | Last, after F20. Page skin only under Q3 (a): every element reads "nem használt"; the parts of the two frames that show a live element get the verdict `structure`. Saving a letter is a global write: `style-studio-2` is the mutation-outcome fixture of that POST, nothing is saved live. The desktop layout (the active letter per element) stays (R21). |

### 4.4 How shared files are protected

**1. Ownership is checked by a script, not by trust.** `node scripts/pulse-merge-check.mjs <id>` (INT, before
every merge) expands the package's `owns` from `work-packages.json` and refuses a branch whose diff against its
merge base touches any other path — in particular `src/i18n/**`, `src/ui/**`, `src/app/**`, `src/lib/**`,
`frontend/scripts/**` and every `use*.ts` — or raises a budget, or carries a fixture that fails
`pulse-fixture-check`, or touches an anchored file without a green `verify:gates` run on the squashed tree.

**2. i18n goes through a patch file** — `docs/pipeline/pulse/pkg/<id>/i18n.patch.json`:

```json
{
  "package": "S-nutrition",
  "base": "<sha of pulse-redesign the patch was written against>",
  "namespaces": ["nutrition"],
  "set": [
    { "key": "nutrition.unitKcal", "hu": "kcal", "en": "kcal", "de": "kcal",
      "after": "nutrition.addCta", "copy": "existing-literal",
      "source": "NutritionPage.tsx literal; frame nutrition-1",
      "untranslated": { "reason": "unit symbol" } },
    { "key": "nutrition.dateTriggerLabel", "hu": "Dátum választása", "en": "Choose date", "de": "Datum wählen",
      "copy": "proposed", "visible": false, "source": "aria-label of the header date trigger, frame nutrition-1" }
  ],
  "change": [
    { "key": "library.backCaption", "hu": { "from": "…", "to": "…" }, "en": null, "de": null,
      "copy": "fix", "source": "Screens/exercise-detail.md" }
  ],
  "remove": [
    { "key": "nutrition.oldHint", "reason": "its only consumer, NutritionCard.tsx, is deleted by this package" }
  ],
  "copyQuestions": [
    { "where": "heading over the other metrics", "frame": "progress-1", "note": "no string is drawn; left out" }
  ]
}
```

(Keys and strings in the example are illustrative.) Rules, enforced by `pulse-i18n.mjs check`:

- (a) **Adding**: a `set` key lies in one of the package's `namespaces` (`common`, `nav`, `offline`, `palette`,
  `muscle`, `muscleMap` belong to lanes and INT) and is named by a file the package owns.
- (b) **Changing or removing** is decided by CONSUMERS, not by prefix: allowed exactly when every consumer of the
  key — the gate's own scan (R31), run over `pulse-redesign` and the tip of every `pulse/*` branch — is a file
  this package owns. So S-home may remove `nutrition.card.targetCaption` when `HomeNutrition.tsx` was its only
  reader, and S-nutrition may not. INT re-validates every `remove` against all branch tips at apply time.
- (c) every `set` carries `hu`, `en` and `de` with identical `{{placeholders}}`; `copy` is one of `inventory`
  (the string is in `hu.json` or the screen's inventory note), `existing-literal`, `fix`, `proposed`; a
  `proposed` string says whether it is `visible` (R22).
- (d) `untranslated` follows the gate exactly: REQUIRED when the `en` or the `de` string equals the Hungarian
  one, FORBIDDEN otherwise (an `en` = `de` pair like "Coach" is ordinary). `apply` writes the entry into
  `scripts/data/i18n-untranslated.json`; a `remove` of an exempted key drops its entry.
- (e) "pending" means committed: `apply` reads the patch from the branch's HEAD, and no key may be touched by a
  patch on another branch tip.
- (f) the tool itself: an empty patch leaves the three bundles byte-identical; the seven flat dotted top-level
  keys (`achievement.workout.first` …) stay flat; line endings are preserved (the working copies are CRLF);
  key order is identical in the three files.

The agent commits the patch file and lets `pulse-sync` apply it in the slot; it never commits the bundles. INT,
at the merge: squash -> `pulse-i18n apply` from the same file -> build -> one commit. Key and consumer land
together. Every visible `proposed` string is appended to `copy-to-approve.md`, every `copyQuestions` entry to
`deviations.md`.

**3. Variant deltas travel the same way** — `pkg/<id>/variants.json`:
`[{ "element": "E21", "live": false, "reason": "one Pulse look; tap, as the database serves" }]`.
`pulse-variants check` refuses a delta whose `useElementVariant` read is not in a file the package owns
(R11): screen packages hand in E21, E22 (S-workout) and E25, E26 (S-coins) only; E6 / E2, E11, E7 / E14, E15 and
the 14 playground-only elements come from F8, F11, F12, F13 and F2. `apply` writes `catalog.ts` and
`scripts/data/elements-dormant.json`.

**4. Lanes also hand in `shared.patch`** — a git-format patch (made with `git diff` in the slot, then the
working copy restored by `pulse-sync`) of the hunks a lane needs in files it does not own: a token or keyframe
inside its named block, a `package.json` script line, a `PlaygroundPage` demo case, a `navTabs.ts` data line.
It may only modify existing files. INT applies the same file with `git apply --3way`; if it no longer applies,
the lane re-cuts it against the new base — INT does not re-type it.

**5. Requests to INT** — for everything a hand-in file cannot express. One JSON file per request, dropped into
`C:/Users/Petike/Documents/Cursor/tracker/.pulse/inbox/<id>.json` (the live channel, git-ignored) and copied to
`docs/pipeline/pulse/pkg/<pkg>/requests/` (the record):

```json
{
  "id": "R-S-progress-02",
  "from": "S-progress",
  "kind": "ui-prop",
  "blocking": false,
  "target": "frontend/src/ui/data/LedgerRow.tsx",
  "need": "A trailing unit slot that aligns to the numeral's baseline (kg after 83,1).",
  "evidence": "progress-1@2x.png, y 260-330; app-kit.js ledgerRow({ unit }); capture .pulse/shots/S-progress/progress-1.tile-1.png",
  "proposedApi": "<LedgerRow unit?: string />",
  "proposedPatch": "docs/pipeline/pulse/pkg/S-progress/requests/R-S-progress-02.patch",
  "interim": "the row is built without the unit until this lands",
  "status": "open",
  "resolution": null
}
```

`kind` is one of `token` · `ui-component` · `ui-prop` · `shell` · `nav` · `gate` · `asset` · `copy-shared` ·
`fixture` · `sandbox` · `decision` · `bug`. `blocking: true` only when no frame of the package can be finished
without it. A `proposedPatch` must pass `git apply --check` and is a suggestion, not a merge. INT answers on its
next loop tick: `accepted` (its own commit `pulse(ui): …` with a kit specimen, a kit-reference update and a full
hybrid sweep), `rejected` (with the reason and the component to use instead) or `deferred`. The agent then runs
`pulse-sync`.

**6. Budgets, states and fixtures are files of the package** (`pkg/<id>/budget.json`, `states.json`), so the
only non-feature files a screen agent ever writes are its own. Fixtures of the 59 FRAME states live with INT
(`frontend/scripts/fixtures/`); a fixture for a package's extra state lives in its `states.json` and passes the
same `pulse-fixture-check` at the merge.

### 4.5 Hand-off (what "I am done" consists of)

`docs/pipeline/pulse/pkg/<id>/handoff.json` on the package branch, grown state by state: the frames and extra
states with capture paths and one verdict each —

- `matched`: replay of recorded data, geometry probe green, tiles compared;
- `matched-fixture`: the same on a fixture (the fixture's edit list is attached);
- `structure`: the state could not be reproduced, with the reason;
- `pending-F15`: the frame's subject is the figure, which is still the old drawing —

then the probe outputs, the explained inventory diff, the source-ledger lines with reasons, the budget before
and after, open requests, deviations taken under Q4, `proposed` copy (visible or not), the result of the live
smoke with every write it made and on which sandbox object, and the last green build line of `pulse-verify`.
Then the status file says `handoff`.

### 4.6 Queue and the maximum number of agents

**Maximum sensible: 6 screen agents + INT.** Beside them at most 2 read-only reviewers and the mannequin lane.
What sets the limit: memory (3.1 GB free when the verify note measured it, 5.1 GB today; builds, previews and
headless Chrome are bursts and sit behind the 2-slot lock), INT's attention (requests against `src/ui`, not the
16 s builds), and this machine's history of runs cut by sleep or a usage limit — a wave loses less when it is
small. Not the limit any more: the shared database and the login budget (captures are replays) and file overlap
(there is none).

| Wave | Agents | Packages, in queue order | What opens the next step |
|---|---|---|---|
| 1 — calibration | 3 | S-home, S-auth (on stage 1), then S-settings (as its lanes land) | **Gate A**: F18 accepted AND S-home merged and independently reviewed against `_jovahagyott-v1-home@2x.png` AND the live check of Home on K's training day; every primitive defect found is fixed in `src/ui` first. The owner is shown Home and Auth; his answer is not waited for. |
| 2 — long poles and the member's tabs | 4 | S-workout (run 1), S-library, S-coach-plans, S-nutrition, then S-progress, S-coach-chat, S-plan-editor, S-workout (run 2), S-client-detail-a, S-client-detail-b | **Gate B** (6 slots): the first four merges of wave 2 went in without a send-back for ownership or a red build, S-settings is reviewed, and free RAM is at least 1.5 GB |
| 3 | 6 | S-exercise-detail, S-coins, S-notifications, S-onboarding, S-coach-dashboard, S-compose-hub, S-public-pages, S-admin | rolling |
| 4 | 6 | S-compose-post, S-compose-profile, S-marketplace, then F20 (INT), then S-style-studio | — |

A slot is refilled from the lowest wave whose dependencies are met, when its package is merged or blocked.
S-workout keeps its slot between its two runs.

### 4.7 Shared database and accounts

The rule is enforced by the tool (R25), not by this table; the table says what the tool is configured to allow.

| Action | Where it may happen live | Everything else |
|---|---|---|
| Any GET, any account | free (replay needs none) | — |
| Starting a session, checking or voiding a set, an interval run | T (S-workout) | fixture |
| Logging food, adding a measurement | T (S-nutrition, S-progress) — never M: M is Home, Profil and most reviewer captures | fixture |
| Plan editor mutations | the scratch template plan and the zero-day plan (S-plan-editor; F13's Undo proof; 7.2 row 4) | the member's plan is never written |
| Client diet and equipment edits, a chat message | K (S-client-detail-a / -b, S-coach-chat) | fixture |
| Post editor autosave, cover upload | the scratch draft post (S-compose-post) | fixture; never publish or withdraw |
| Mark-read on `/notifications`, the chat read receipt | never — stubbed in every capture | — |
| First onboarding, minting a code, saving a variant, approving or rejecting a submission, publishing, registering, `logout-all`, a password change | never | mutation-outcome fixtures |
| Restoring `app.pulse-baseline.db`, any backend restart | INT, after any package whose hand-off lists a live write on K or T, and at every wave boundary — never mid-capture | — |
| Logging in | only the capture tool's cookie jars (R19); ids are read from the freeze or from `GET /api/v1/clients` / `/plans` at run time, never hard-coded | — |

---

## 5. Definition of done

Tolerances for "matches the frame", all MEASURED: colours, faces, sizes, case and tracking exact (computed
style); every box of the frame's geometry file within 2 pt of its rendered box; ink-tight numerals within 3 pt.
Ignored: the status-bar band, the home indicator, the 52 pt corners, every row of dev-verify §3.5, masked areas
(covers, Home's D2 row against the approved frame), and what D1 / D2 / D3 removed. A box of the geometry file
that has no counterpart in the DOM is LISTED by the probe: it is either data the recording does not hold
(explained once per frame) or a defect.

### 5.1 A screen package is done when ALL of these hold

| # | Criterion | Evidence |
|---|---|---|
| 1 | **Gates and type-check**: the build is green in the slot — run through `pulse-verify`, the only sanctioned way (it holds the lock) — and again in the integration worktree after the squash merge (the 13 gates + `tsc -b` + `vite build`). `npx tsc --noEmit` without `-p` is not evidence — it checks 0 files. | the last line of each build |
| 2 | **Budget**: `pkg/<id>/budget.json` is deleted (every ratchet rule is zero in every owned file). A remaining count needs an open request that explains it; the package is then `merged`, not `accepted`. | `check:pulse` totals |
| 3 | **Visual, against the Figma frame**: every frame is captured in replay from the BUILT app at 402 x the frame's height (874 for one-viewport frames), scale 2, insets 62 / 34. (a) The geometry probe is green. (b) The tiles — frame, app, difference, at most 874 pt each, so nothing is judged downscaled — are compared in this order: left edge and hairlines -> type (face, size, case, tracking) -> vertical rhythm (header top 72 / 64, first block 152 / 178, 32 between blocks) -> the one lime pill -> tab bar (count, lit icon, y 782-838) -> imagery (present, unframed). The verdict is one of 4.5; `matched` needs (a) and (b) on recorded data. | `.pulse/shots/<id>/<frame>.tile-<n>.png`, `<frame>.geometry.json` |
| 4 | **Probes** on every captured state: the three fonts loaded and the numeral's computed family is the display face; at most one visible lime pill, a pill being a button or link with the accent background and a height of 44 or more (a badge and an ON switch are not pills); zero boxed surfaces outside the allow-list, by `data-kit` (pill, switch, sheet, badge, skeleton, bars); no horizontal overflow at 360, 402 and 430; every target at least 44 x 44, except muscle regions while a chip row is on screen (the documented exception, `MuscleMap.tsx:65-80`); no console error and no failed request beyond those the state declares (the 401 on `/auth/me` when signed out; a fixture's own 500); for a frame taller than 874, one more capture at 402 x 874 scrolled to the end, in which the last content clears the bar and the fade; a focus walk — Tab through the state's controls, each focused one shows the ring or the field's underline change. | probe JSON |
| 5 | **States still working**: every state in the screen's inventory note and in `understand/screens.md` §4 (last paragraph) is reached — on the recording, another account, a fixture or a sandbox object — with its `arrived` assertion true, and captured: loading, empty, error with retry, offline-disabled, each sheet, each destructive path, each mutation outcome the screen shows (saving / saved / failed, undo, stale). A state that could not be produced is reported `structure`, never `matched`. | `handoff.json` |
| 6 | **No behaviour lost**: the control inventory of every state equals its baseline or each difference is explained (removed by D1 / D2 / D3; renamed; moved; role changed with the reason); for the six desktop files the same at 1280 px. The source ledger (hook calls, mutation calls, doors, `role=` / `aria-*`, and the counts of `focus-visible:`, `useMotionSafe(`, `motion-reduce:` at the merge base and now) is empty or reasoned. No frozen file in the diff. Structural accessibility kept: roles, labels, `aria-describedby`, roving tabindex, sr-only tables. | inventory diff, ledger, `pulse-merge-check` |
| 7 | **Three languages**: the patch passes `pulse-i18n check`; `check:i18n` is green after apply; the base state is captured in `hu`, `en` and `de` with no overflow, no truncated label and no key path on screen; no literal copy, `aria-label`, `placeholder` or `title`; display-face uppercase is a CSS transform, never an uppercase string. | three captures |
| 8 | **Reduced motion**: one capture with `--reduced-motion` — the state change is still visible, `document.getAnimations()` holds no running animation with infinite iterations, no countdown is drawn frozen. | capture + probe |
| 9 | **Live smoke**: the base state of each frame opened once against the live backend with the account's jar — it renders, with no undeclared error. Every write the package's states make live is on a sandbox object and listed. No pixel equality is claimed here; this row proves the code against the real API, not against the recording. | `handoff.json` |
| 10 | **Honesty**: nothing of `screens.md` §4 implemented as a working path; no invented feature, badge, photo or stand-in image; every fixture is an edit list that passes `pulse-fixture-check`; every deviation under Q4 in `deviations.md`; every `proposed` string listed; the five slide-back checks of Pulse System §6 answered "no" on the agent's own captures. | `handoff.json` |
| 11 | **Integrated**: one revertible commit on `pulse-redesign`, recorded in the progress snapshot. | commit sha |
| 12 | **Independent review passed** (section 7.1) with no blocking finding open, and no visible `proposed` string unticked (R22) -> status `accepted`. | `review/<id>.json`, `copy-to-approve.md` |

### 5.2 The foundation is done when ALL of these hold ([S1] = also required for stage-1 acceptance, F17)

| # | Criterion |
|---|---|
| 1 [S1] | The build is green on `pulse-int`; `npm run verify:gates` shows every probe turning its gate red — one planted defect per ratchet rule id among them — and the tree restored byte for byte (`git status` clean afterwards). |
| 2 [S1 for stage-1 components] | The kit board (`/playground`, kit section, board layout) captured at 1300 x H, scale 1, and tiled against `_components-1.png … _components-4.png`: every component in every drawn state — judged on the tiles by an agent that did not build it. Ink-tight numerals, the single-baseline ledger row and the section head are judged on the capture, not on the source. Every interactive specimen also shows its keyboard-focus state. |
| 3 [S1] | Fonts in the built app: `document.fonts.check` true for the three families; the F1.2 glyph and tabular-figure result on record; preload tags name the hashed files; the font weight of a Hungarian session reported (target 150 KB; over it is the owner's call, 3.3); no Inter / Space Grotesk in `dist/`. |
| 4 [S1] | Assets: 49 files from 35 sources, at most 1.0 MB; `check:assets` (8 assertions) green; no `mix-blend-` in `src`; no Pulse image inlined as base64 in a JS chunk. |
| 5 [S1] | Shell, measured at 402 x 874 with insets: bar at y 782-838 with no computed background, for 5 / 6 / 7 tabs (M / C / A); exactly one `aria-current` on every route of the gate's table; fade solid from y 780; a pushed header at 64; the same at 360 and 430 and with `--insets 0` (nothing touches an edge); the desktop dock still present at 1280. Idle Edzés lands on the library. |
| 6 [S1] | The freeze exists and its baseline was contact-sheet-checked by an agent that did not build the capture tool. The hybrid sweep (F1.6 criteria, in replay) passes for all 59 states after the last merged lane; the only inventory differences are the listed, intended ones. |
| 7 [S1] | D1 proof: a stale `localStorage['tracker.theme']` (pack id, custom accent, gradient, transparency) and `user@` (server pref `aurora`) render plain Pulse on every sampled screen; no request to `/me/theme`. |
| 8 | The player law holds on the hybrid player: at 402 x 874 and 360 x 640, with and without the offline line, the active check control is inside the viewport above the bar. |
| 9 | Contracts intact, checked by an agent that did not write the lane: `toast()` signature and kinds, an Undo toast (a day deleted on the SCRATCH plan) still undoes, offline line and a toast together do not overlap; a sheet opens, traps focus and closes on Escape; `Switch` `role="switch"`; `Segmented` radiogroup; `Field` label wiring; `TrendChart` sr-only table; the focus walk and the reduced-motion probe pass on the kit page (Pulse adds two loops: the pill's resting pulse and the skeleton sheen — both must stop). |
| 10 | `check:pulse`: the per-rule totals at G-c equalled the independent counts of F0 (or each difference is explained); every lane's own budget file is gone or holds only the documented bridge remainder; `docs/pipeline/pulse/kit/*.md` describes every export; the progress snapshot holds a commit sha for every lane; `.pulse/hybrid/` is the stored reference. |
| 10b | Mannequin stage 0 is merged: `side` / `onSideChange`, `sideControl="none"`, the fixed 597 : 1261 box; the three screens that mount the map are pixel-equal to the sweep before it. |
| 11 (F15 stage 1, not part of F18) | Every roster slug has a region; regions are buttons as today; props still additive only. IoU >= 0.95 for every region that has a reference picture (today: chest, quads, lats and the shared shoulder cap; all 22 under Q1 (b)). A contact sheet of all 22 regions, lit one by one, judged by an agent that did not build it. The owner signs off every region that has no reference picture — in any case the five groove-less ones. Then the seven `pending-F15` frames (`library-1..3`, `exercise-detail-1..2`, `workout-1..2`) are captured and reviewed again and the player law probe re-runs. |

---

## 6. Verification — who runs what, when

The proof channel is always headless Chrome over CDP against a BUILT app (dev-verify §5.2): the only run that
sees the production CSS, hashed font and image URLs and real safe-area insets. The in-app Browser pane is for
clicking around; it does not composite reliably on this machine and cannot set insets — a pane screenshot is
never the proof.

### 6.0 What the capture tool is (the specification F3 is accepted against)

| Part | Behaviour |
|---|---|
| Modes | `--replay` (the default): every `/api` request is fulfilled from `.pulse/rec/` through CDP `Fetch`; no backend, no cookie; the service worker is bypassed; an unrecorded request fails the capture and is reported. `--record` / `--record --only-missing`: live, stores responses (2.5). `--live`: the jar cookie; non-GET fail-closed except the state's `writes` on sandbox objects. |
| Clock | CDP virtual time, started at the recording instant; a step `{ "advance": <ms> }` moves it; a capture is taken only when no finite animation is running. Fallback if virtual time misbehaves with fonts or lazy chunks: an injected `Date` / timer shim with the same two controls (section 10). |
| Steps | controls addressed by accessible name only; every step, and every state, ends in an `arrived` assertion (role + name + state, or a visible string). A target that is not found FAILS the capture — nothing continues silently. |
| Fixtures | edits over a recorded response (`[{ "pointer": "/session/status", "value": "planned" }]`), for any method; mutation outcomes (200 / 409 / 500) and the stubs for requests a page fires on opening are fixtures too. Checked by `pulse-fixture-check` (R26). |
| Viewports | 402 x H at scale 2 with insets 62 / 34 (the frame capture); `--width 360 / 430`; `--insets 0`; 402 x 874 scrolled to the end for tall frames; 1280 for the six desktop files; 1300 at scale 1 for the kit board. |
| Probes | fonts; pill count; boxed surfaces by `data-kit`; overflow; targets; console and requests against the state's declared list; geometry against `pulse-geometry/<frame>.json`; the focus walk; under `--reduced-motion`, no running infinite animation; the player law. |
| Outputs | PNG, tiles (frame, app, difference; at most 874 pt each) + one overview, a contact sheet per run, the control inventory `{ role, name, disabled, href }`, probe JSON. |
| Login (live only) | one cookie jar per account in the OS temp dir, written atomically, renewed by `POST /auth/refresh` under a lock; a fresh login only when a refresh is refused; a run asks for a cookie that outlives the run BEFORE it takes a build / capture lock. The fixture password is read at run time from `backend/scripts/seed-dev-users.mjs` and written nowhere. |
| Locks | 2.1. `pulse-verify` = lock -> kill a stray listener on the port -> build -> preview -> captures -> stop the preview -> release, with `finally`. |

### 6.1 Per agent, in its own slot (any number in parallel; builds and captures behind the 2-slot lock)

| When | Command (cwd `<slot>/frontend`) | Looks at |
|---|---|---|
| on start / resume / after INT answered a request | `node scripts/pulse-sync.mjs <id>` — revert the local applies, merge `pulse-redesign`, `npm ci` if needed, re-apply the committed hand-in files (2.1) | it stops with the reason if a hand-in file no longer applies |
| before the first JSX edit | `node scripts/pulse-verify.mjs --package <id> --baseline --inventory`, then read the contact sheet | rule 7 of 4.1 |
| while working (seconds) | `npx tsc -p tsconfig.app.json --noEmit --pretty false` (6.7 s) · `npm run -s check:tokens` · `npm run -s check:pulse` · `npm run -s check:i18n` · `node scripts/pulse-ledger.mjs <id>` · `node scripts/pulse-i18n.mjs check` · `node scripts/pulse-fixture-check.mjs <id>` | fast feedback (these take no lock) |
| per finished state | `node scripts/pulse-verify.mjs --package <id> --port 518<n>` = build -> preview -> replay captures, tiles, probes, geometry, inventory diff -> stop | the tiles (Read tool, one tile at a time) and the probe JSON |
| before hand-off | the same with `--lang en`, `--lang de`, `--width 360`, `--width 430`, `--reduced-motion`, `--scroll-end`; `--live --smoke` once; `node scripts/check-pulse.mjs --fix-down <id>` | 5.1 rows 4, 7, 8, 9 |

### 6.2 Per integration — INT, serially, in the integration worktree

0. `git status` is clean (the live progress file is not in any tree, so it really is). If not: stop and find out why.
1. `node scripts/pulse-merge-check.mjs <id>` (it runs `pulse-owns-check` and `pulse-fixture-check`).
2. `git merge --squash pulse/<id>` (nothing committed yet).
3. The hand-in files, by the tools: `pulse-i18n apply` (every `remove` re-validated against all branch tips),
   `pulse-variants apply`, `git apply --3way` of a lane's `shared.patch`.
4. `npm run build`.
5. Preview on `:5189` -> `pulse-shot --package <id>` in replay (the package's frames and extra states).
6. **Sweep, sized by what changed:**
   - a screen package (feature files, keys only it consumes, its own variant deltas): the **smoke set** — one
     base state per member tab + `/coach` + `/login` (7 states) with inventory — because nothing else can have
     moved;
   - anything under `src/ui`, `src/app`, `tokens.css`, `index.css` or a `common.*` / `nav.*` key (a lane, an
     accepted request): the **full sweep** — all 59 states + inventories against the stored reference, with the
     intended differences listed up front.
7. `npm run verify:gates` when the merge touches a gate or a file on `verify:gates --list-anchors` — always for
   S-settings, S-workout and S-coach-dashboard (3.6). A broken anchor is re-anchored by INT in this same commit.
8. Any red step: `git reset --hard HEAD` (nothing was committed, and nothing but the squash is lost), write the
   reason into the package's status, send it back. Green: `pulse-progress snapshot` -> one commit (2.4) with the
   snapshot in it -> `git merge --ff-only pulse-int` in the main checkout -> refresh `.pulse/review/index.html`
   (the index of tiles the owner can open) -> restore the baseline DB if the hand-off lists a live write.

### 6.3 At a wave boundary — INT

Full sweep; `verify:gates`; the `master` drift measurement (R23); the baseline DB restored (never re-seeded —
the freeze is the reference); any `npm install`; any restart of the backend or the owner's dev server; a
milestone report to the owner in Hungarian, short, with tiles, and with the three lists by name: frames on
fixtures, frames `pending-F15`, screens reachable by URL only.

### 6.4 Who never runs what

| Command | Why | Who may |
|---|---|---|
| `npm run verify:gates`, `verify:nav-gate` | they rewrite source files for seconds; a kill mid-run leaves a planted defect | INT, integration worktree, clean tree — never the main checkout |
| a build, a preview or a merge in the main checkout | the owner's dev server watches it | nobody; INT only fast-forwards it |
| `npm install <pkg>`, seeds, a backend restart, re-recording an existing entry of the freeze | shared state | INT |
| a commit on `pulse-int`, the fast-forward of `pulse-redesign`, any push, any touch of `master` | D4 | INT (commit and fast-forward only); nobody pushes |
| a login outside the capture tool's jars, `logout-all`, a password change on a fixture | the shared login budget and session version (R19) | nobody |

---

## 7. Phase 2 — review, regression sweep, closing

### 7.1 Independent comparison of every screen with its frame (rolling — starts with the first merge)

- A reviewer is an agent that did not build the screen and is read-only on the code. At most 2 while screen
  agents run (they share the capture lock), 3 afterwards. Suggested split so nobody reviews its own work:
  member (10 screens), coach (8), public + admin (6).
- It works in its OWN worktree (`tracker-wt/review-<n>`), checked out detached at the commit the progress
  snapshot records for the package, built there, previewed on its own port. It never reads the main checkout or
  INT's `dist/`. Its captures are replays of the same freeze; the builder's pictures are not trusted. The review
  file records the commit sha. Per screen: every frame at 402 (59 in all); the base state also at 360 and 430
  and in `en` and `de`; one capture with reduced motion; the scrolled-to-end capture of tall frames.
- Checklist per frame: the geometry probe output and the six comparison steps of 5.1 row 3 on the tiles; the
  five non-negotiables of Pulse System §1 and the five ways back into cards of §6; one hero only; lime only for
  action / selected / live; text never on a lit area; display-face words uppercase; mono only for figures;
  left-aligned; exact Hungarian copy against the inventory note; the lit tab; every undrawn state the builder
  composed (these also go on the owner's list); for a `matched-fixture` frame the fixture's edit list, read
  against the inventory note — is this a state the product can really be in?; the `arrived` assertions of the
  package's states; the inventory diff and the source ledger re-read against
  `git diff <merge base>..<sha> -- <owned paths>`.
- Output: `docs/pipeline/pulse/review/<id>.json`, appended finding by finding — `id`, `severity`
  (`blocking` / `major` / `minor` / `owner`), `frame`, `region`, the violated rule, the capture path, the file, a
  suggested fix. `blocking` = wrong structure, lost behaviour, a box, a second pill, unreadable text, a broken
  state, a fixture that shows an impossible state. `owner` = a question, not a defect.
- Fixes: a new branch `pulse/<id>-fix<n>` from `pulse-redesign` (never the squashed branch), same ownership,
  same merge procedure; the reviewer re-checks only its own findings. Two rounds at most; what is still open goes
  to the owner's list instead of a third round. Minors are batched into one fix package per area.
- A finding against a shared component is an INT request, fixed once in `src/ui` with a full sweep.

### 7.2 The regression sweep (INT + two agents, on the built app, when every package is `accepted` or waits only for copy)

| # | Sweep | How |
|---|---|---|
| 1 | Gates | `npm run build`; `npm run verify:gates` |
| 2 | All 59 frames | `pulse-shot --all` in replay, one row per frame in `review/final.json` with its verdict; stored as `.pulse/final-pre/` |
| 3 | Behaviour, by inventory | the control inventory of every state (and the 1280 inventories of the six desktop files) against the ORIGINAL baseline of step 0.1; every difference must already be in `deviations.md` or a `handoff.json` |
| 4 | Behaviour, by flow (click scripts, LIVE, sandbox objects only) | sign in -> Home; as T: start -> check a set -> rest timer -> go offline (CDP) -> check a set (queued, offline line shown, player still one viewport) -> online (drained); T's interval plan: one interval run; as T: log a food, add a measurement; coach: client K -> four tabs -> send a chat message to K; plan editor on the scratch plan: open a day, reorder, delete a day, Undo; post editor on the scratch draft: type, autosave; signed-out read of `/m`, a post, a coach profile; admin: open a submission (no decision). Baseline DB restored afterwards. |
| 5 | Languages, widths, insets | base state of each screen x `hu` / `en` / `de` x 360 / 402 / 430; `--insets 0`; 1280 for the six desktop files and five others |
| 6 | Roles | member (5 tabs), coach (6), admin (7); one lit tab on every route of `router.tsx`; the role gates of `/admin`, `/coach`, `/compose` still refuse |
| 7 | Offline and service worker | LIVE preview in a persistent profile (the one sweep with the service worker on): load, go offline, reload — the shell renders, both states of every tab icon are present, the offline line shows; `verify:outbox` green |
| 8 | D1 leftovers | stale `tracker.theme`; the `aurora` account renders Pulse; `/coins` lists no theme item its user does not own |
| 9 | What no gate sees | `check-pulse --report` all zero; a grep of `src` for `text-[`, `tracking-[`, `leading-[`, `border-2`; a second `text-*` class beside `text-giant`; `useElementVariant(` call sites against `catalog.ts` |
| 10 | Untouched backend | `git diff --stat master...pulse-redesign -- backend/` is empty; `npm run smoke` in `backend/` (hermetic, its own temp DB) still passes |
| 11 | Weight and dependencies | `dist/` against the 2026-10-05 build (JS 1.25 MB, CSS 91 kB, fonts 307 kB): the font weight of a Hungarian session, images under 1.0 MB, no `.woff`, no base64 image in a chunk; `npm audit --omit=dev` in `frontend/` |

### 7.3 F20, then the closing cleanup F19

**F20 — the playground-only variants retire (INT; after every lane's stage 2, before S-style-studio; the Q3
default).** Deleted: the seven variant files only the playground imports (`E1Button`, `E3IconButton`,
`E4Toggle`, `E5Checkbox`, `E8E9`, `E10Tabs`, `E17E19` — 4 581 lines), the four playground-only exports that
share a file with a product element (`InteractiveCard` and `Progress` in `E12E16.tsx`, `SwipeItem` and `Fab` in
`E14E20.tsx`), their `Demo` cases and `PREVIEWABLE` entries. The 27 catalogue rows STAY, all `live: false` with a
dormant reason — the frozen backend still knows 27 ids. Full sweep; the studio's differences are listed up
front. It comes before S-style-studio so that the studio is built against the final state and closing stays a
visual no-op. Under Q3 (b) this package is cancelled and the re-authoring becomes its own effort; under (c) it
is replaced by the removal of studio, playground, catalogue and gate, and S-style-studio is dropped.

**F19 — closing (INT, strictly last, one commit per row, each proven by a gate).** Precondition: every package
is `accepted`, or `merged` with nothing open but visible copy the owner has not ticked yet (listed for him).

| # | Delete / flip | Proven by |
|---|---|---|
| 1 | Bridged legacy tokens and the `-subtle` / `-border` / `on-*` / `info` forms with their `--color-*` mappings; in the SAME commit `check-tokens` gets `RETIRED_STEMS` (3.6) | `check-tokens` fails while a consumer remains, including on a stem that no longer exists; probe: `text-on-success` planted |
| 2 | The 10 legacy type steps from `tokens.css` AND `TYPE_STEPS` | `check:type-scale` prints 16 steps |
| 3 | `Surface` + `surfaceRecipe`, `SummaryTile`, `Gauge`, `DataTable` if unused, `coaching/Monogram.tsx`, the `secondary` / `ghost` / `danger` variants and chip tones, the optional `icon` / `badge` / `size` / `placement` props | `tsc -b` (`noUnusedLocals`), `check:pulse` — which, since G-c, also counts the variant literals inside expressions, so `tsc` finds nothing new here |
| 4 | `control()` default `size` -> `lg` for `primary`; the `pill-size` rule removed | sweep |
| 5 | `check:pulse`: every budget file is gone (`pkg/_int/` included) -> the budget mechanism is deleted and the rules become unconditional bans; its probes stay in `verify:gates` | probe |
| 6 | Retired shell tokens (`--nav-bg`, `--nav-blur`, `--nav-fg-*`, `--nav-dock-offset`, `--content-pad-b-lg`, `--toast-*`), the `badge-pop` keyframes, the emptied lane blocks' markers, variant files with no importer left | `check-tokens`, `tsc -b` |
| 7 | Docs: `frontend/DESIGN.md` rewritten for Pulse; the numbers stripped from `Pulse System.md` (its own header asks for it); an ADR recording D1-D4, R1-R31 and the answers to Q1-Q7. The cookie jars in the OS temp dir are deleted. | — |

**Cleanup must be a visual no-op.** After every row the 59 captures are taken again, in replay, and compared
pixel by pixel with `.pulse/final-pre/` (tolerance 0.1 % of pixels — meaningful now, because a replay has no
moving data); any larger difference stops the row.

Delivered to the owner at the end: `docs/pipeline/pulse/review/final.json`, `deviations.md`,
`copy-to-approve.md`, the refreshed `.pulse/review/index.html`, and the two follow-up packages in order —
(1) the backend package for the coin-store packs (Q2), (2) finish / abandon workout (D3).

---

## 8. Resumability

Runs on this machine die on sleep, an app close or the usage limit. The rule: **anything not on disk in one of
the places below does not exist.**

| Place | Path | Tracked | Written by | Holds |
|---|---|---|---|---|
| The live progress file | `C:/Users/Petike/Documents/Cursor/tracker/.pulse/progress.live.json` | no | **INT only**, on every loop tick, atomically (`pulse-progress sync` folds the status files in) | everything that changes between commits: heartbeat, claims, slot and port assignment, request status, per-frame verdicts |
| The progress snapshot | `…/tracker/docs/pipeline/pulse/progress.json` | yes | generated by `pulse-progress snapshot`, ONLY inside an integration commit; never edited by hand | the live file without the heartbeat — what the owner and a new session read from git |
| Status files | `…/tracker/.pulse/status/<id>.json` | no | the agent that owns `<id>` | the live heartbeat of one package |
| The package branch | `pulse/<id>` in `…/tracker-wt/slot-<n>` | local branch | the agent | work-in-progress commits, the hand-in files and the hand-off (`pkg/<id>/**`) |
| The freeze | `…/tracker/.pulse/rec/**`, `.pulse/sandbox.json`, `backend/data/app.pulse-baseline.db` | no | INT (anyone may append a missing GET) | the reference of every equality proof. Copied once, right after it is made, to `C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/freeze-backup/` — it exists nowhere else |
| Evidence | `…/tracker/.pulse/{baseline,hybrid,shots/<id>,review,final-pre}` | no | the capture tool | PNGs, tiles, inventories, probe JSON |
| Locks | `…/tracker/.pulse/locks/*.json` | no | `pulse-verify` | pid, package, port, preview pid, heartbeat (2.1) |

Because the live file is in no git tree, the integration worktree is clean between commits by construction, and
a `git reset --hard` there can only ever discard a half-applied squash.

### 8.1 The progress entry — one per work package (live file and snapshot share the shape)

```json
{
  "schema": 2,
  "branch": "pulse-redesign",
  "updated": "2026-10-12T20:00:00Z",
  "integrator": { "owner": "<agent id>", "heartbeat": "<ISO, live file only>", "step": "F1.3" },
  "freeze": { "seededOn": "2026-10-12", "recordedAt": "2026-10-12T18:04:11+02:00",
              "dbCopy": "backend/data/app.pulse-baseline.db", "backup": "…/5-pulse/freeze-backup/",
              "sandbox": { "scratchPlan": "<id>", "emptyPlan": "<id>", "draftPost": "<publicId>",
                           "intervalPlanOnT": "<id>", "writeClient": "demo.kovacs.eszter@", "writeMember": "demo.toth.reka@" },
              "baselineCommit": "0860942",
              "gates": { "check:i18n": "876 keys", "check:type-scale": "10 steps" },
              "independentCounts": { "surface": 97, "legacy-type": 615, "legacy-variant": 132 } },
  "ownerQuestions": { "Q1": { "default": "a", "answer": null }, "Q2": { "default": "a", "answer": null },
                      "Q3": { "default": "a", "answer": null }, "Q4": { "default": "a", "answer": null },
                      "Q5": { "default": "a", "answer": null }, "Q6": { "default": "a", "answer": null },
                      "Q7": { "default": "a", "answer": null } },
  "burnDown": { "surface": 97, "legacy-type": 615, "legacy-variant": 132 },
  "packages": {
    "S-nutrition": {
      "kind": "screen", "title": "Étkezés", "wave": 2, "status": "in_progress",
      "owner": "<agent id>", "slot": 3, "branch": "pulse/S-nutrition",
      "worktree": "C:/Users/Petike/Documents/Cursor/tracker-wt/slot-3", "port": 5183,
      "dependsOn": ["F18", "S-home"],
      "files": "<generated from work-packages.json — never typed>",
      "frames": { "nutrition-1": "matched-fixture", "nutrition-2": "in_progress" },
      "extraStates": { "nutrition-no-target": "baseline-captured", "nutrition-over-target": "todo" },
      "budget": { "before": 61, "now": 14 },
      "requests": { "R-S-nutrition-01": "accepted" },
      "liveWrites": [],
      "copyPending": 0,
      "commit": null, "review": null,
      "lastStep": "nutrition-2: picked-food block built, tiles not yet compared",
      "notes": "",
      "updated": "<ISO>"
    }
  }
}
```

(The numbers are illustrative; the real ones are written by F0 and G-c.) `status`: `todo` -> `claimed` ->
`in_progress` -> `handoff` -> `integrating` -> `merged` -> `in_review` -> (`changes_requested` ->
`in_progress`) -> `accepted`; plus `blocked` (with the request id or the hand-in file that no longer applies).
Frame results: `todo`, `in_progress`, `structure`, `pending-F15`, `matched-fixture`, `matched`. Foundation
packages, the seven commits of F1, lane stages (`F8:1`, `F8:2`, `F15:0`), the merges of F2 (`F2:a`, `F2:b`,
`F2:c`), the two runs of S-workout, reviews and the rows of F19 use the same entry shape.

### 8.2 What each agent writes, and when

| Who | Writes | When |
|---|---|---|
| Screen / lane agent | `.pulse/status/<id>.json` — `{ status, lastStep, frames, extraStates, budgetNow, blockedOn, updated }` | on claim; after every state reaches a new verdict; when a request is filed; when blocked; at hand-off. At least once per finished state — never only at the end. |
| Screen / lane agent | a WIP commit on `pulse/<id>` (`git add` of owned paths only — the hand-in files are owned paths) | after every state that builds green in its slot, and whenever a hand-in file changes (the tool only applies committed ones) |
| Screen / lane agent | `pkg/<id>/handoff.json`, `i18n.patch.json`, `variants.json`, `shared.patch`, `states.json`, `requests/*` | as they come into being; the hand-off file is grown state by state |
| INT | `.pulse/progress.live.json` | when it assigns a claim (owner, slot, port); on every loop tick; when a request is resolved; when a review file appears |
| INT | `docs/pipeline/pulse/progress.json` | only through `pulse-progress snapshot`, inside an integration commit |
| Reviewer | `docs/pipeline/pulse/review/<id>.json` | finding by finding |

### 8.3 Continuing after an interruption

1. Clear dead locks and stray previews (`pulse-verify --clean`: a lock whose pid is dead or whose heartbeat is
   stale, any listener on 5180-5189). Read `.pulse/progress.live.json`; if it is missing, rebuild it from the
   committed snapshot plus the status files (`pulse-progress sync --from-snapshot`). If `integrator.heartbeat`
   is older than 30 minutes the new INT takes the role and first makes the INTEGRATION worktree sane:
   `git status` — a half-applied squash is discarded with `git reset --hard HEAD`; a `.probe-backup` left by a
   killed `verify:gates` is restored with `npm run verify:gates -- --restore`; the build must be green before
   anything else. Then the main checkout: it must be clean and at `pulse-int`'s last commit — if it is behind,
   `git merge --ff-only pulse-int`; if it is dirty, stop and ask (somebody edited the owner's tree).
2. `git worktree list` and `git branch --list "pulse/*"`. For every entry that is not `accepted`: read its status
   file and `git log pulse-redesign..pulse/<id>`. The slot and its branch are the truth; the status file says
   where inside the package the agent was.
3. A package `in_progress` is CONTINUED in its own slot by a new agent that is given the entry, the status
   file, `handoff.json` so far, and the instruction "run `pulse-sync <id>`, then `pulse-verify`, continue from
   `lastStep`". It is never restarted from the frame. The only files the sync puts back are INT's paths that a
   tool had patched locally (2.1); the package's own uncommitted work is not touched.
4. A package `integrating` is re-run from 6.2 step 1 — the procedure is idempotent because nothing is committed
   before its last step.
5. Backend down or the DB changed: INT restores `app.pulse-baseline.db` and restarts the stack. Replay captures
   do not notice either; only live smokes and flows wait.
6. The freeze is lost or damaged: restore it from `freeze-backup/`. If that is gone too: seed, sandbox, record,
   baseline again (2.5) — fixtures survive because they are edit lists, the old-look baseline is regenerated
   from the base worktree, and every package in flight re-captures its own baseline before it continues.
7. Suggested run boundaries, each starting with step 1 and a keep-awake request: (a) F0 + step 0.1 up to the
   freeze; (b) F1.6 + step 0.2 + stage-1 acceptance; (c) wave 1 + step 0.3 + foundation acceptance; (d…) the
   queue, one wave-sized batch per run; then the fix rounds; then the sweep, F19.

---

## 9. Out of scope, and the order in which the owner sees results

### 9.1 Explicitly out of scope for this effort

| Out | Why / where it goes |
|---|---|
| Any change under `backend/`: delisting the two pack items, compensating owners (a ledger write), retiring `/me/theme`, the icon background constant, an equipment key on the exercise list, `sessions_28d` on the client endpoint, a date switch for the demo seed, any seed change | D1 / D3. The coin-store package is first on the list afterwards, under the backend rules (named worker transaction, numbered `user_version` migration, idempotency key, the 5-pass checklist). |
| Finish / abandon workout (hook, sheet, copy, outbox guard, backend half) | D3: its own package after every screen is accepted; it needs a drawn design and approved copy first. No placeholder control is built. |
| Re-authoring five variants per element; keeping the 14 playground-only elements alive | Q3 default: they retire in F20 |
| New doors and flows the product lacks: `/compose` and `/m` on a phone (Q5), an entrance to onboarding, redeeming a join code, a member chat screen, a set-your-own-password screen, a first share on Haladás | product gaps, not redesign; the gate prints its two open exemptions on every run |
| New behaviour the frames merely suggest: confirm sheets for revoke / block, an event date field, equipment thumbnails in library rows, a coach photo, grading uploaded covers, the verified tick, URL state for tabs, a new route-error screen | the "do not invent" lists of the inventories; R20 |
| Light mode, theme packs, a custom accent | D1. Only the mechanism stays cheap: every lit value derives from `--accent`, and the one baked copy is gated (R9). |
| A desktop DESIGN (above 430 pt) | Pulse is drawn at 402 pt. What the six desktop files do today is kept in Pulse skin (R21); nothing new is designed |
| New imagery: eight missing equipment stills, a bell or camera render, a Pulse app icon and favicon, lit reference pictures for the mannequin (unless Q1 (b)), real covers on the seeded posts | no source art exists; those places stay typographic, the old mark keeps its place, covers are masked |
| Locale and data fixes (ISO dates, decimal points, `60g`, English exercise names and statement reasons) | drawn 1:1; listed in `deviations.md` |
| A test framework, native Capacitor projects, AVIF, production hosting headers | not present today; not introduced here |
| `git push`, any change to `master`, merging `master` in without the owner's word | D4, R23 |

### 9.2 What the owner can open, in order

How: the main checkout is only ever fast-forwarded to a commit that was built green in INT's worktree, and the
stack runs there — `http://localhost:5173`, accounts `user@` / `coach@` / `admin@tracker.local` (the dev
fixture password is in `backend/scripts/seed-dev-users.mjs`). Nothing half-merged, no planted gate defect and no
build ever happens in that tree. Frame-beside-app tiles: `.pulse/review/index.html`. Every milestone is reported
to him in Hungarian, short, with tiles; anything that needs his decision is an option prompt.

| # | After | He can open | What to judge |
|---|---|---|---|
| 1 | step 0.1 (the switch) | every screen, hybrid: black canvas, lime, Big Shoulders / Geist, 24 pt gutter, no theme picker | **nothing yet** — the structure is still the old one; `.pulse/baseline/` holds the "before" pictures |
| 2 | step 0.2, the shell | the new tab bar on every signed-in screen (5 / 6 / 7 tabs by account); the idle Edzés tab opens Gyakorlatok (D2) | the first finished Pulse piece: compare with any frame's bar |
| 3 | step 0.2, the kit | `/playground` -> "Pulse kit": the shared components in their states, also laid out like the Figma boards | against the Figma component boards |
| 4 | wave 1 | **Belépés / Regisztráció** (signed out) and **Kezdőlap** (`/`) as `user@` — the first real screens, with their tiles (`auth-1/2`, `home-1/2/3`); then **Profil** | Home and Profil are the two frames he approved pixel by pixel. A correction here changes the primitives for all the rest. What he sees live is today's real data; the tiles show the frame's data (1.3). |
| 5 | wave 2 | **Edzés** (Gyakorlatok when idle, the player with `user@`'s live session), **Étkezés**, **Haladás** — with Home and Profil, all five member tabs; then as `coach@`: **Edzéstervek**, **Tervszerkesztő**, **Csevegés**, **Kliens adatlap** | the member's bar, left to right. **The figure on Gyakorlatok and in the player is still the old drawing** until row 8. |
| 6 | wave 3 | **Gyakorlat részletei**, **Érmék**, **Értesítések**, **Onboarding** (by URL); `coach@`: **Edzői kezdőlap**, **Piactéri pult** (by URL — Q5); signed out: **Poszt**, **Edzői profil** (by URL); `admin@`: **Admin** | — |
| 7 | wave 4 | the two editors and **Piactér** (by URL), **Stílus stúdió** | the studio says "nem használt" on every element (Q3) |
| 8 | whenever F15 lands | the graphite mannequin on the selector, exercise detail and the player at once; the contact sheet of the 22 regions for his sign-off | Q1 |
| 9 | Phase 2 | the same app with the bridge gone, plus `final.json`, `deviations.md`, `copy-to-approve.md` | the three lists that need his word |

---

## 10. Unverified assumptions and risks

Assumptions (each is checked at the step named and has a fallback)

| Assumption | Checked in | Fallback |
|---|---|---|
| The headless capture can render the real app from recorded responses alone: CDP `Fetch` fulfils every `/api` request including binary media, with the service worker bypassed (only a `data:` page was exercised so far) | F3 | none for the tool — it is the proof channel; if REPLAY specifically cannot be made to work, see risk 5 |
| CDP virtual time, started at the recording instant, runs the built app normally (font loading, lazy chunks, React timers, the rest and interval countdowns) | F3 | an injected `Date` / timer shim with the same "set" and "advance" controls |
| The geometry export from Figma gives usable boxes (text nodes are named by their string; auto-layout frames are "Row" / "Col") | F0 step 2 | the lime pill, the hairlines, the bar and the numeral ink are measured from the 2x PNG by colour threshold; every other box is judged on tiles and marked `unmeasured` in the hand-off |
| The sandbox objects can be made through the public API: a template plan, a zero-day plan, a draft post with a cover, and an interval prescription for T (`Screens/workout.md:150` says such a stage exists only when authored through the API) | F3.D | the interval stage stays fixture-only and is reported so; the other three are ordinary coach actions |
| Seeded on a weekday, M gets a PLAN session (the seed falls back to "Szabad edzés" on a rest day, `seed-demo.mjs:1218-1273`) | F3.D step 1 | seed again the next day |
| One process per cookie jar is enough for the server's refresh-reuse detection; a kill between rotation and the jar write costs one fresh login | F3 | a second login for that account; never a loop |
| The recorder stores no credential: `Set-Cookie` and `Authorization` headers are dropped, the store is git-ignored and local | F3 acceptance | — |
| `vite preview --port <p> --strictPort` overrides the configured 4173 and keeps the `/api` proxy (only needed for live runs now) | F3 | a `PULSE_PORT` env read in `vite.config.ts` (one INT line) |
| The same click script reaches a sub-state on the old and on the new markup (controls addressed by accessible name); a miss is now loud (`arrived`) | F3, then every package's first act | a per-package override in `pkg/<id>/states.json` |
| CSS `url()` in the hand-written `fonts.css` resolves a file inside a Fontsource package | F1.2 | a relative path into `node_modules`, or `?url` imports |
| Big Shoulders Display ships tabular figures; all three faces carry ő / ű (package metadata lists `latin-ext`, U+0100-02BA; not verified at glyph level) | F1.2 | fixed-width digit cells in `Numeral`; the successor display family; the stop described in 3.3 |
| The F1.4 codemod is purely mechanical (`text-body`, `text-display`, `text-micro` not followed by `-`), including class names built in expressions | F1.4 (`git diff` shows only those tokens; the hybrid sweep shows no size change) | the missed sites are found by the sweep and renamed by hand in the same commit |
| `check:elements` can tell a product read from a playground-only read at export granularity without a parser | F2 (G-b) | an explicit list of the 14 playground-only export names in `scripts/data/`, with the gate asserting none is imported outside the playground |
| The tightened door rule is green with only the two open exemptions | F2 | a further written, printed exemption + a `deviations.md` line per route, never a relaxed rule |
| Lanes' `shared.patch` files apply with `--3way` because each writes inside its own named block | every lane merge | the lane re-cuts the patch; INT never re-types it |
| `text-box-trim` is usable for ink-tight numerals in the target WebViews | F10 | per-face offset tokens, judged on captures |
| Six slots fit in memory behind a 2-slot lock | Gate B | stay at four |
| Safari / WKWebView render baked-alpha WebP, the font stack and the fade like Chromium | not verifiable on this machine | reported as "not verified on WebKit" in `final.json` |

Risks — what is still uncertain after the review

1. **The hybrid window is long.** Between the switch and the last package, unmigrated screens are neither old nor
   Pulse. If the effort stops halfway the branch builds and works but is not shippable as a design. The queue
   order puts what the owner opens first at the front.
2. **Phase 0 got heavier.** The capture tool now records, replays, drives time, checks fixtures and measures
   geometry; the integration tools grew by three. F3 is the critical path and is a long run. Wave 1 starts
   later than revision 1 promised; in exchange, what it proves holds.
3. **The bridge hides leftovers by construction** (a neutralised card is invisible, not gone). Only `check:pulse`
   and the runtime boxed-surface probe find them; a hole in their rules lets a hand-built box of legal tokens
   survive until a reviewer sees it. The per-rule probes and the independent counts narrow this; they do not
   close it.
4. **INT is the throughput ceiling and a single point of failure.** Mitigated by the heartbeat takeover and
   idempotent merges, not removed. INT never takes a screen package.
5. **Replay is new and everything leans on it.** If it cannot be made reliable, the fallback is live captures
   with every comparison of a state made on one server day, equality claimed for inventories only, and the
   closing pixel compare run with masks over data — weaker, and the reports must say so.
6. **A replay proves the code against a recording, not against the API.** The backend is frozen in this effort,
   so the contract cannot drift; a request the new code shapes differently is caught only by the live smoke
   (one per package) and the flows of 7.2.
7. **The calibration screen is fixture-fed.** The approved Home frame is a state the seed cannot reach, so Gate A
   rests on `matched-fixture` plus one live check on another account. A wrong fixture would calibrate every
   later screen wrongly; the reviewer reads the edit list for exactly this.
8. **The geometry probe can be noisy.** Boxes that do not map to the DOM are listed, and an agent can learn to
   explain lists away. Reviewers check the lists; nothing else does.
9. **"No behaviour lost" rests on states somebody listed.** A state nobody captured before the rewrite has no
   baseline; rule 7 of 4.1 and the contact-sheet check exist for this. The flow scripts of 7.2 are the second net.
10. **The shared dev database** can now only be written on K, T and the scratch objects, by tool rule. What
    remains: those objects drift between restores, and a restore that is forgotten shows up in the next live smoke.
11. **`master` moves** while a 16 000-line JSX rewrite sits on an unpushed branch — and F1.4's codemod adds 152
    mechanical line changes in files `master` may also touch. R23 measures the conflict surface at every wave
    boundary; it does not shrink it.
12. **Owner defaults may be overturned late.** Q3 (b), Q4 (b), Q5 (b / c), Q6 (b) or Q7 (b) after their packages
    are merged mean rework in the player, coins, the studio, the dashboard and every screen that kept an undrawn
    behaviour. `deviations.md` keeps that rework findable, not free.
13. **The mannequin may not reach the approved look.** Under the Q1 default, 19 of 22 regions have no reference
    picture and are accepted by eye and by his sign-off; until then seven frames stay `pending-F15` and the
    rejected drawing is what the Edzés tab shows.
14. **Six screens cannot be reached on a phone** (Q5 default). They are redesigned, reviewed and reported "URL
    only"; whether they ship that way is not this plan's decision.
15. **The coin-store filter (Q2 a) is cosmetic.** Until the backend package lands a forged request can still spend
    coins on a pack that does nothing; coins are user value, so that package must not slip.
16. **Copy waits on the owner.** A visible proposed string keeps its package at `merged`; if he does not tick the
    list, the effort ends with packages that are finished but not `accepted`.
17. **Design gaps become implementation guesses**: the 360 x 640 player, the desktop layouts in Pulse skin,
    several toasts at once, where Home's library row sits, the five groove-less muscle regions. Each is a
    recorded default that can be judged wrong on sight.
18. **AI-generated imagery in a public repository**: the commits stay local (D4); the usage terms must be checked
    before the first push.

---

## 11. Review round 1 — what changed, and what was not taken

### 11.1 Findings and where each was fixed

| Lens | Finding (short) | Severity | Fixed in |
|---|---|---|---|
| collisions | a merge into a slot with locally applied patches is refused by git | major | 2.1 (`pulse-sync`), 6.1, 8.3; F4 |
| collisions | the i18n exemption list lives inside the gate script | major | R30, F1.0, 4.4 rule (d) |
| collisions | lanes have no committed channel for foreign edits | major | R29, 4.4 item 4, a `pkg/<lane>/` folder per lane |
| collisions | one budget file for five parallel lanes; stale budgets | major | 3.6 `check:pulse` (per-id files, `--init` on the merged tree, re-lowered in pre-claim commits) |
| collisions | the main checkout is bench, evidence source and live view | major | R28, 2.1, 6.2, 7.1, 9.2 |
| collisions | `progress.json` is dirty between commits and lost by a reset | major | section 8 (live file + generated snapshot), 6.2 steps 0 and 8 |
| collisions | i18n ownership by namespace does not match the tree | major | 4.4 rules (b) and (e); `muscle` / `muscleMap` moved to F15 |
| collisions | the login budget does not hold from wave 2 on | major | R19 (jars), R24 (replay needs no login), 6.0 |
| collisions | probe anchors inside files that packages rewrite | minor | 3.6 (`--list-anchors`, literals in briefs), 6.2 step 7 |
| collisions | variant deltas assigned to packages that cannot make them true | minor | R11, 4.4 item 3 |
| collisions | `untranslated` rule, flat keys, CRLF | minor | 4.4 rules (d) and (f), F4 acceptance |
| collisions | locks and previews have no recovery | minor | 2.1 (lock file with pid and heartbeat), 8.3 step 1 |
| collisions | `sharp` is not reachable in a slot | minor | 3.3 lane E (`--sharp-from`) |
| collisions | food and measurement writes on the calibration account | minor | 4.7 (T only), R25 |
| collisions | no validator; ownership written three times; stray worktree | minor | 2.3 (`pulse-owns-check`, generated `files`), F0 step 1 |
| gates | seven unowned variant files block the closing cleanup | major | F20, `pkg/_int/budget.json`, Q3 |
| gates | after the deltas "live" means "playground only"; Q3 misinforms | major | 3.6 `check:elements`, R11, Q3 rewritten |
| gates | ratchet holes (expression variants, three re-valued steps, descriptor, file inputs) | major | R3 + the F1.4 codemod, 3.6 `check:pulse`, `FilePick` in F12, per-rule probes, independent counts |
| gates | the safe-area rule cannot see insets behind derived tokens | major | 3.6 `check:safe-area` |
| gates | merge "conflict-free by construction" is false | major | 2.1 (`pulse-sync`); the sentence is gone |
| gates | fixtures only for GET; states that need a mutation; reads that write | major | R25, 6.0 (fixtures for any method, stubs), 4.7, 4.3 |
| gates | deleting the `on` / `info` stems blinds `check-tokens` | minor | 3.6 `check:tokens`, F19 row 1, `wash` rule |
| gates | the accent has a second, ungated copy in the asset manifest | minor | R9, `check:assets` eighth assertion |
| gates | focus ring and reduced motion are claimed but unproven | minor | 5.1 rows 4, 6, 8; 5.2 rows 2, 9; the ratchet's "kept rules" leg |
| gates | probe anchors rot silently | minor | 3.6 `verify:gates`, the stale nav anchor fixed in G-b |
| gates | glyph check after the visible switch, no continuation | minor | F1.2, the paragraph under the F1 table |
| gates | the giant numeral has two size sources | minor | 3.4 F10, 3.6 `check:type-scale`, 7.2 row 9 |
| gates | door exemptions carry a reason the gate forbids | minor | R13, Q5 |
| gates | Q2 does not say the two packs are the whole store | minor | Q2 |
| gates | desktop behaviour cut without telling the owner | minor | R21, Q4, the 1280 baseline |
| reality | every equality proof runs against a moving reference | major | R24, 2.5, 1.3 |
| reality | the editors write on every tap; "never save" cannot be followed | major | R25, 2.5 sandbox, 4.7, 4.3 |
| reality | a fixture can show what the product cannot produce | major | R26, 4.5 verdicts, Gate A live check |
| reality | tolerances cannot be checked by eye at half resolution | major | R27, F0 step 2, 5.1 rows 3 and 4 |
| reality | the baseline certifies itself | major | R20, 3.3 exit, 4.1 rule 7 |
| reality | frozen `MuscleMap` props cannot compose the frames | major | R17, F15 stage 0, 5.2 row 10b |
| reality | the mannequin's cost and acceptance are not honest | major | Q1, 5.2 row 11, `pending-F15` |
| reality | S-workout is under-estimated | major | 4.3 (two runs, Q7, fixtures + virtual time, T's interval plan) |
| reality | S-plan-editor cannot meet its own definition of done | major | 4.3, the two scratch plans, after S-coach-plans |
| reality | S-client-detail is four screens; its number has two answers | major | split into -a / -b; `useClients()` |
| reality | login arithmetic fails from wave 3 | major | R19, R24 |
| reality | three probes fail on approved frames | minor | 5.1 row 4 |
| reality | the kit acceptance has no comparable pair | minor | F7 board layout, 5.2 row 2 |
| reality | four things the owner has not seen | minor | R22, the Home row picture (1.2), Q6, the route-error screen dropped |
| reality | the asset brief is ambiguous; covers | minor | 3.3 lane E list, 1.3 cover mask |

### 11.2 Rejected review findings (or taken in another form), with the evidence

1. **Pin the server clock for the seed and the recording** (reality, first option of the moving-reference
   finding). Not taken. `backend/scripts/seed-demo.mjs:115` reads `new Date()` and the script has no date
   argument or environment switch (its only `process.env` read is the production guard at :64); a JavaScript
   `Date` preload does not reach SQLite's `date('now')` / `unixepoch()` (`backend/src/coaching/routes.js:130`
   and the other SQL sites), so a "pinned" backend would run on two clocks; and it is a process setting of the
   dev backend the owner has not allowed. Taken instead: the finding's own second option — the weekday frames
   are declared, verified on fixtures (`matched-fixture`) and Home is checked live on another account.
2. **Split S-workout by file** (reality). Not taken. The rest timer goes in flow inside the player, so
   `RestTimer`'s height is part of the one-viewport budget that `WorkoutPlayer.tsx:50-86` owns; two packages
   would have to agree on one number, which is this project's first defect class. Taken: the alternative the
   same finding offers — one package, two planned runs.
3. **A slot at rest never has a patched INT path** (gates, the stronger form: `pulse-verify` applies and
   reverts around each run). Not taken. The checks an agent runs every few seconds while editing need the
   applied state: `check:i18n` fails on a referenced key that is not in the bundles and on a dead one
   (`check-i18n.mjs:398`, `:238`), `check:elements` on a read whose catalogue row disagrees. Taken: the
   collisions lens's form — `pulse-sync` reverts before every merge and re-applies after.
4. **A long-lived session broker process** (collisions). Not taken in that form: a daemon is exactly what dies
   on this machine. The same guarantee — one holder per refresh token — is given by a jar file renewed under a
   lock, which survives a kill (the reality lens's form). The suggested fifth start question about
   `NODE_ENV=test` is not asked either: with replay and jars the effort needs about seven logins in all; it
   stays an information line (1.3).
5. **Run `pulse-owns-check` in F0** (collisions). F0 comes before the lane that writes the script. The same
   check was run on `work-packages.json` against `git ls-files` when this revision was written (11.3); the
   script repeats it from F4's merge on and inside every merge check.
6. **Make the 14 playground-only elements an owned lane** (gates, second option). Not taken: nothing a user
   sees depends on them and Q3's default retires them (F20, the finding's first option).
7. **Run the glyph check through `pulse-shot`** (gates). Taken with a different tool: F1.2 can run before the
   capture tool is merged, and plain headless Chrome with `--dump-dom` is enough for a width comparison.
8. **Upload the three sample covers to the seeded posts** (reality, first option). Not taken: changing a
   published post runs through the compose and moderation flow this plan never triggers on live data. The six
   frames carry a cover mask; only the scratch draft gets a cover.

### 11.3 Re-validation of `work-packages.json` (run when this revision was written)

Run against `git ls-files` at `0860942` and the 59 frame PNGs with a throwaway script (the real
`pulse-owns-check` is F4's). Result: no problems.

- The file parses: 21 foundation packages (F0-F20) and 24 screen packages.
- No file is owned by two packages — checked on every tracked file and, for files that do not exist yet,
  pattern against pattern.
- Every one of the 145 files under `frontend/src` is accounted for: 112 owned by exactly one package, 23 frozen,
  10 with the integrator and no package (`main.tsx`, `ui/feedback/LoadingAnnouncer.tsx`,
  `ui/feedback/useMotionSafe.ts` and seven `lib/` files: `api`, `equipment`, `haptics`, `measure`, `person`,
  `registerSW`, `useAppName`).
- Each of the 24 screens is covered by exactly one package (`S-client-detail-b` declares
  `partOf: "client-detail"` and no screen of its own). Each of the 59 frames is assigned to exactly one package
  and has its PNG.
- Every `dependsOn` resolves, the stage-qualified ones (`F8:2`, `F15:0`, `F2:c` …) to a declared stage; no
  package depends on a later wave.
- Every pre-claim edit names a later owner that really owns the file; every deleted file is owned by the
  package that deletes it; no package is told not to touch a file it owns.
- The 24 `useElementVariant` reads in the tree are each claimed by exactly one package and — F2's rule change
  aside — by the package that owns the file holding the read.
- Every lane and package owns its hand-in folder; each of the seven owner questions has exactly one recommended
  option and blocks only packages that exist.

The check found one real defect of revision 1, now fixed: F1 owned `frontend/src/lib/**`, which contains the
frozen `outbox.ts`; F1 owns `lib/cn.ts` only.

Status: COMPLETE — revision 2 (sections 0-11).
