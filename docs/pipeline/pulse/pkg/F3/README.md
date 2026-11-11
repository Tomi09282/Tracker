# F3 — the capture tool ("eyes")

What is here, how to use it, and what the freeze consists of. The specification it was built
against is `PLAN.md` 6.0; where the real machine forced a different answer, section 7 says so.

| File | What it is |
|---|---|
| `frontend/scripts/pulse-shot.mjs` | the capture tool: headless Chrome over raw CDP, no npm dependency |
| `frontend/scripts/pulse-verify.mjs` | lock -> build -> preview -> captures -> stop -> release; `--clean` |
| `frontend/scripts/pulse-frames.json` | the 59 frame states: route, account, frame height, click script |
| `frontend/scripts/fixtures/*.json` | fixtures of frame states (edits over recorded answers) |
| `frontend/scripts/pulse-sandbox.mjs` | makes the writable scratch objects, writes `.pulse/sandbox.json` |
| `scripts/dev-stack.mjs`, `.claude/launch.json` | the dev stack with one command; a backend launch entry |

Everything is run from `<tree>/frontend`. In Git Bash a bare argument that starts with `/` is
rewritten into a Windows path, so the tool never takes one: routes live in the frames file.

## 1. The three feeds

| | `--replay` (default) | `--record` | `--live` |
|---|---|---|---|
| `/api` GET | answered from `.pulse/rec/` | the live backend, stored | the live backend |
| a GET nobody recorded | **fails the capture** (`unrecorded`) and is listed with the command that adds it | — | — |
| a non-GET | a fixture or a stub answers it, else it is stopped in the browser | the same | the same — plus the state's `writes` on sandbox objects |
| clock | virtual, at the recording instant | virtual, at the recording instant | real |
| login | none | the cookie jar | the cookie jar |

`/healthz` (the offline indicator's probe) is answered `200` in a replay. The service worker is
bypassed and never registers. `--probe-write` fires a POST from the page on purpose and reports
`write guard held` when it was stopped — run it once after any Chrome update.

**The clock.** CDP virtual time, started at the recording instant; timers, `requestAnimationFrame`
and `performance.now()` run on it and it stands still while a request is pending. On top of it the
wall clock (`Date`) is PINNED: it moves only by an `{ "advance": <ms> }` step, never by how long the
page took. `--clock shim` is the plan's fallback (the pinned wall clock alone, timers in real time);
`--clock real` touches nothing. `node scripts/pulse-shot.mjs --self-test --serve <frontend dir>`
proves "set" and "advance" on both. A state may carry its own `"clock"` (an ISO instant): `home-1`
is captured on Friday 9 October 2026, the day its frame was drawn for.

**A capture is taken when** the document is complete, no request is in flight, the fonts are
loaded, every `<img>` is complete and decoded, no finite animation runs, the DOM has not changed
for 350 ms, and two consecutive screenshots are the same bytes. Infinite animations (skeleton
sheen, the pill's pulse) are held at their first frame for the picture and counted in the probe
report. The caret is hidden.

## 2. Commands

```bash
# one or more states, a package, or all 59
node scripts/pulse-shot.mjs home-1 coins-2 --base http://localhost:5182
node scripts/pulse-shot.mjs --package S-coins --base http://localhost:5182
node scripts/pulse-shot.mjs --all --base http://localhost:5189

# serve a built tree for the duration of the run (stops it afterwards)
node scripts/pulse-shot.mjs --all --serve C:/Users/Petike/Documents/Cursor/tracker-wt/base/frontend --port 5180

# variants (the suffix is part of the file name: home-1.w360.png, home-1.en.png …)
--width 360 | 430 | 1280 | 1300     --height <pt>     --scale <n>     --insets 0
--scroll-end        402 x 874 scrolled to the end (probe: the last content clears the bar)
--lang en | de      --reduced-motion      --local-storage '{"tracker.theme":"…"}'
--focus-walk        Tab through the state; every stop must show the focus
--strict            a probe that does not pass, or an inventory that differs, fails the capture

# in a slot: the only sanctioned build + capture (takes one of the two locks)
node scripts/pulse-verify.mjs --package S-coins            # port 518<n> from the slot's path
node scripts/pulse-verify.mjs --package S-coins --baseline # the base build, into .pulse/baseline
node scripts/pulse-verify.mjs --package S-coins --live --smoke
node scripts/pulse-verify.mjs --clean                      # dead locks, stray previews on 5180-5189

node scripts/pulse-shot.mjs --compare a.png b.png --diff-out d.png   # same pixels? where not?
node scripts/pulse-shot.mjs --list
```

Outputs (default `.pulse/shots/<package | adhoc>/`, `--baseline` = `.pulse/baseline/`, `--out <dir>`):

| File | Content |
|---|---|
| `<key>.png` | the capture, 804 x 2H px for a frame state |
| `<key>.controls.json` | the control inventory `{ role, name, disabled, href }` in document order |
| `<key>.controls.diff.json` | removed / added against the baseline of the same state |
| `<key>.probe.json` | fonts, pill, boxed, overflow, targets, reducedMotion, inView, scrollEnd, focusWalk, geometry |
| `<key>.geometry.json` | every layer of the frame: matched / deviating / unmatched, and style mismatches |
| `<key>.tile-<n>.png` | frame \| app \| difference, at most 874 pt per tile; `<key>.overview.png` the whole height |
| `<key>.FAILED.png`, `.FAILED.controls.json` | the page as it was when the capture failed, and the names a script could have used |
| `_run.json`, `_contact-<n>.png` | the run (Chrome version, clock, results) and its contact sheet |

A capture FAILS (exit 1) on: a step target that is missing or ambiguous, an `arrived` assertion
that does not hold, a page that does not settle, an unrecorded request, a blocked write, an
undeclared failed request or console error, a dialog, a viewport that is not the one asked for.
Probes only fail it under `--strict` — on a hybrid screen most of them cannot pass yet.

## 3. `pulse-frames.json`

```jsonc
"coins-2": {
  "frame": "coins-2", "title": "Érmék — Eredmények", "package": "S-coins",
  "account": "M",                       // a letter of "accounts", an e-mail, or null = signed out
  "route": "/coins",                    // {name} = an id: "resolve" (a GET + a row match), "ids", or .pulse/sandbox.json
  "height": 1108,                       // the frame's height in pt (width 402, scale 2, insets 62 / 34 by default)
  "opened": { "role": "tab", "name": "Bolt" },   // what must be there before the first step (default: the address)
  "steps": [
    { "click": { "role": ["tab", "radio", "button"], "name": "Eredmények" },
      "arrived": { "anyOf": [ { "role": "tab", "name": "Eredmények", "selected": true }, … ] } }
  ],
  "arrived": { … },                     // the state-level assertion; a state without one is refused
  "reach": "seed",                      // seed | fixture | sandbox | superseded | specimen
  "fixture": "home-1",                  // frontend/scripts/fixtures/<name>.json
  "clock": "2026-10-09T15:00:00+02:00", // optional: the instant this state's page clock starts at
  "mask": ["^(Cover|Image/cover)"],     // layer-name patterns (or {x,y,w,h} in pt): grey in the tiles, skipped by the geometry
  "mustSee": [ { "role": "button", "name": "Kész", "nth": 0 } ],  // inside the viewport, above the bar (the player law)
  "expect": { "requests": [ { "path": "/api/v1/auth/me", "status": 401 } ], "console": ["regex"] },
  "writes": [ { "method": "POST", "path": "/api/v1/plans/{scratchPlan}/days" } ],   // live only, sandbox only
  "stubs": [ … ], "localStorage": { … }
}
```

- **Controls are addressed by accessible name only.** `role` may be a list (the side switch is two
  pressed buttons today and a radio group in the kit). Names are compared with case and spacing
  folded, because Chrome reports a name AFTER `text-transform`. `{ "re": "^Felsőtest" }`,
  `{ "key": "nav.home" }` (looked up in `src/i18n/<lang>.json`) and `{ "hu": …, "en": …, "de": … }`
  are the other forms. More than one match is an error: add `nth`, `within` or `outside`.
- **Steps**: `click`, `type` (`text`; clears the field first), `press` (Tab, Enter, Escape, Space,
  arrows), `advance` (ms), `scroll` (`"end"`, `"top"` or a target), `offline` (true / false), `wait`.
  Every step ends in `arrived`: `{ role, name, selected | checked | pressed | expanded | disabled }`,
  `{ text }`, `{ noText }`, `{ url }`, `{ absent: { role, name } }`, `{ anyOf: [...] }`, or a list (all).
- **A package's own states** live in `docs/pipeline/pulse/pkg/<id>/states.json`:
  `{ "states": { "<key>": { … } }, "overrides": { "<frame key>": { …fields to replace… } } }`.
  An extra state carries its fixture inline as `"fixtures": [ … ]`.

`reach` today: 49 `seed`, 6 `fixture`, 2 `sandbox`, 1 `superseded` (workout-3, D2), 1 `specimen`
(post-detail-3). `checked` in each state says how its script was verified. Three more states
(`home-2`, `workout-1`, `nutrition-1`) reach their state from the seed but show the DRAWN data only
with a fixture their package writes (`"drawn": "fixture"`).

## 4. Fixtures (R26) and stubs

A fixture is a list of answers under the key `fixtures` (the key `pulse-fixture-check` looks for).
A GET answer is **edits over the recorded answer**; a mutation outcome is a status, with a body only
where the page cannot do without one. `frontend/scripts/fixtures/home-1.json`,
`coach-dashboard-2.json` and `style-studio-2.json` are the worked examples.

```jsonc
{ "state": "home-1", "what": "…", "why": "…",
  "fixtures": [
    { "method": "GET", "path": "/api/v1/workouts/current",
      "edits": [ { "pointer": "/log", "value": null }, { "pointer": "/sets", "value": [] } ] },
    { "label": "mint", "method": "POST", "path": "/api/v1/invite-codes", "status": 201, "body": { "id": 900001, "code": "…" } },
    { "after": "mint", "method": "GET", "path": "/api/v1/invite-codes",
      "edits": [ { "pointer": "/codes/0", "insert": true, "value": { "$from": { "path": "/api/v1/invite-codes", "pointer": "/codes/[kind=multi]" } } } ] }
  ] }
```

- `path`: exact, or `*` for one segment, `**` for a tail. `query` (a subset) and `whenBody` (a subset
  of the JSON body) narrow a rule; `after: "<label>"` makes it apply only once the rule with that
  label has answered (the list read that follows a mutation).
- Pointers are JSON pointers plus `[field=value]` (the first row with that value), `*` (every row,
  edits only) and a trailing `-` (append). `"remove": true` deletes, `"insert": true` puts a new row
  before the index, `"add": true` is needed to create a key the answer does not have.
  **An edit that addresses nothing is an error** — a fixture that silently does nothing is a recording.
- Values: `{ "$from": { "path", "pointer" } }` copies from another answer (recorded in a replay, read
  live otherwise); `{ "$now": <ms> }` (`"as": "epoch"` for seconds) and `{ "$today": <days> }` come
  from the capture clock; in strings `{$today}`, `{$today:1}`, `{$monday}`, `{$body.field}`,
  `{$path.3}` and `{id}` are filled in.
- A frame that was answered by a fixture is capped at **`matched-fixture`** (`verdictCap` in `_run.json`).
- **What `pulse-fixture-check` (F4) accepts today is narrower than what the tool can run**: plain
  pointers, literal values, and no 2xx body for an endpoint that was never recorded. The three
  shipped fixtures keep to that, except the minted code of `coach-dashboard-2` (request R-F3-01).
  `$from`, `$now`, `$today`, `[field=value]`, `*`, `-` and `insert` work in the tool and are
  refused by the checker until it learns them.
- **Stubs** (`defaults.stubs`, or per state) are the answers of requests a page fires on opening:
  mark-read on `/notifications` and the chat read receipt, both answered `204` (the page reads
  neither). They never reach the server, in any feed. The chat's open-or-create POST is NOT
  stubbed: with the thread in the recorded list the page creates nothing, and where there is no
  thread (`coach-chat-2` before the sandbox exists) the capture fails at the stopped write.

For `pulse-fixture-check` (F4): `import { recStore, loadFixture, applyEdits, pointerGet } from './pulse-shot.mjs'`.

## 5. The freeze (`.pulse/rec/`)

`.pulse/rec/_meta.json` holds the recording instant and the time zone. One file per answer:
`.pulse/rec/<account>/<METHOD>_<path>_<hash>.json` =
`{ method, path, query, status, contentType, encoding: "json" | "utf8" | "base64", body, recordedAt, state }`.
`<account>` is the e-mail's local part (`user`, `coach`, `demo.nagy.balazs`, `anon`). Only the
content type is kept of the headers, and an answer whose body contains a session token of any jar
is refused — the store holds no credential. `--record` on an existing freeze stops: `--only-missing`
appends the GETs it lacks (existing answers are replayed, so the page sees the frozen data);
`--rerecord` overwrites and is the integrator's alone.

### Stage D — the commands, in order (integrator; the backend is stopped in step 3 only)

```bash
# 0. a training day of user@ (Mon / Wed / Fri / Sat): after step 1, GET /api/v1/workouts/current for user@ must
#    hold a session with "source": "plan" (on a rest day the seed leaves a freestyle session — then repeat tomorrow)
# 1. seed (main checkout, backend may stay up)
cd C:/Users/Petike/Documents/Cursor/tracker/backend && npm run seed:dev-users && npm run seed:demo
#    a re-seed may drop the cached sessions: the first live run then logs in once per account (7 logins; the limit
#    is 10 per 15 minutes for everybody) — never start two live runs at once, and a refused login means WAIT
# 2. the sandbox objects, through the app's own API (integration worktree)
cd C:/Users/Petike/Documents/Cursor/tracker-wt/int/frontend
node scripts/pulse-sandbox.mjs            # reads only: what exists, what would be made
node scripts/pulse-sandbox.mjs --create   # writes .pulse/sandbox.json; an object that FAILED stays null
# 3. backend STOPPED (the supervisor, not the child):  cp backend/data/app.db backend/data/app.pulse-baseline.db ; start it again
# 4. record — from the BASE build first (it asks for the superset: /me/theme …), then what the current build adds
node scripts/pulse-shot.mjs --record --all --serve C:/Users/Petike/Documents/Cursor/tracker-wt/base/frontend --port 5180 --out C:/Users/Petike/Documents/Cursor/tracker/.pulse/rec-run
node scripts/pulse-verify.mjs --all --record --only-missing --out C:/Users/Petike/Documents/Cursor/tracker/.pulse/rec-run-int
#    expected to FAIL until their fixture exists: workout-2, onboarding-2, onboarding-3 (their GETs are recorded by the neighbouring states)
# 5. the baseline, in replay, from the base build; then the 1280 px captures of the desktop screens
node scripts/pulse-shot.mjs --all --baseline --serve C:/Users/Petike/Documents/Cursor/tracker-wt/base/frontend --port 5180
node scripts/pulse-shot.mjs admin-1 admin-3 style-studio-1 coach-dashboard-1 client-detail-1 coach-chat-1 --baseline --width 1280 --height 900 --serve C:/Users/Petike/Documents/Cursor/tracker-wt/base/frontend --port 5180
#    read .pulse/baseline/_contact-1.png and _contact-2.png (an agent that did not build the tool)
# 6. twice the same pixels?  (any state; the plan's verify line)
node scripts/pulse-shot.mjs home-2 --serve <base frontend> --port 5180 --out <a> ; … --out <b> ; node scripts/pulse-shot.mjs --compare <a>/home-2.png <b>/home-2.png
# 7. copy .pulse/rec, .pulse/sandbox.json and backend/data/app.pulse-baseline.db to
#    C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/freeze-backup/
```

A dry run of steps 4 – 6 was done into a scratch folder against the stale dev database (see the
hand-in report); nothing was written to `.pulse/rec`, `.pulse/baseline` or the database.

## 6. Probes and the geometry comparison

`<key>.probe.json` holds one verdict per probe (`pass: true | false | null` = not applicable):

| Probe | Passes when |
|---|---|
| `fonts` | every face a visible text uses is loaded; a kit numeral is set in the `--font-display` face |
| `pill` | at most one visible button or link has the `--accent` background and is 44 or taller |
| `boxed` | no element has a visible fill plus a shape (radius or border) outside the `data-kit` allow-list (`defaults.probes.boxedAllow`) |
| `overflow` | `scrollWidth` is the viewport and nothing sticks out sideways (run with `--width 360`, `402`, `430`) |
| `targets` | every enabled control is 44 x 44; muscle regions are exempt while a chip row is on screen |
| `reducedMotion` | under `--reduced-motion`, no infinite animation is running |
| `inView` | every `mustSee` control is inside the viewport and above the bottom bar |
| `scrollEnd` | under `--scroll-end`, the last content ends above the bar |
| `focusWalk` | under `--focus-walk`, every Tab stop changes its outline, shadow, underline or tint |
| `geometry` | no layer deviates and no text style differs (see below) |

Console errors and failed requests are not probes: beyond what the state declares they fail the capture.

**Geometry** (`.pulse/geometry/<frame>.json`, or `frontend/scripts/pulse-geometry/` once committed).
Text is matched by its string. Numerals in the display face are measured by their INK box, within
3 pt; other text by the left edge, top and height of its line box, within 2 pt (the right edge only
when the text wraps), and face, size, weight, case, tracking, line height and colour exactly. A kit
layer (`Button/primary`, `Row/…`, `Tab bar` …) is matched to the nearest element with that
`data-kit`; a plain shape to the nearest rendered box or border edge. The status bar and the home
indicator are ignored; vectors inside a glyph are skipped. A layer with no counterpart is listed
under `unmatched` — sample data the recording does not hold, or a defect — never forced onto a
neighbour. A text whose slot holds another string of the same size is listed as
`sameSlotOtherString` and its position and style are still checked.

## 7. What differs from the plan, and what is not proven

- **The lock.** The mutex is the directory `.pulse/locks/heavy-<n>` (atomic `mkdir`), the same one
  agents take by hand; `slot-<n>.json` beside it carries pid, package, port, preview pid and the
  20 s heartbeat. One mechanism, two slots, for both ways of working.
- **The wall clock is pinned on top of virtual time.** Pure virtual time made the clock a function
  of how many pumps the page needed to settle; pinned, two replays are byte-identical.
- **Under a paused virtual clock a screenshot can hang and a decoded picture is not painted.** The
  tool nudges the clock 4 virtual ms at a time while a screenshot is pending and waits two rendered
  frames before each shot. Both were measured failures, not precautions.
- **Chrome renders a capture window lazily.** A window as tall as its frame and never in front is
  treated as occluded: frames stopped coming on some states. Chrome is started with the three
  anti-backgrounding switches, the first screenshot of a browser is paid on a blank page, and the
  wait for a rendered frame lengthens its virtual-time step when 4 ms at a time draws nothing.
- **`display: contents` is invisible to `checkVisibility()`.** Every `Pressable` label sits in such a
  span; the probes, the geometry and the `{ "text" }` assertions did not see them until the tool's
  own visibility test learned it (found by the scroll-end probe reporting the wrong last line).
- **Chrome updates itself.** It went from 154 to 155 during this work. `_run.json` records the
  version; a baseline and a capture taken on different versions must not be compared pixel by pixel.
- **Not exercised** (it needs a write, a later build or the freeze): `pulse-sandbox --create`; a
  live state with `writes`; `--lang en | de` on click scripts whose names are written in Hungarian (`auth-1` and
  `auth-2` use `{ "key": … }` and were captured in all three languages; the others need the same
  in an override); the probes on a migrated Pulse screen (they were run on the old
  look, where `pill`, `boxed` and `geometry` rightly do not pass); 1300 px kit-board tiling against
  `_components-*.png` (the capture works at any width; the tiling of a 1300 px board is not built).
- **Fixtures still to write**, by the package that owns the frame: `workout-2`, `onboarding-2`,
  `onboarding-3` (named in the frames file, the capture fails with "does not exist yet"), and the
  drawn data of `home-2`, `workout-1`, `nutrition-1`.
