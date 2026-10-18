# S-ma — deviations from the frames (lifeos/ma-1 .. ma-4, design round B)

Pairs (Figma | app | difference): `.pulse/pairs/S-ma/<frame>.pair.png` (whole frame) and
`<frame>.pair-<n>.png` (tiles of at most 874 pt), captured from the built app with
`pulse-verify --package S-ma --port 5184` (replay, 402 pt, scale 2, insets 62 / 34) on pulse-redesign
1b7759f with this package's i18n.patch.json and request R-S-ma-01 applied. States: `states.json`
(written by `make-states.mjs`).

Verdict cap: every frame state is **matched-fixture**. The freeze of user@ predates migration 032, so
GET /lifeos/today carries no `habits` / `tasks` and user@ has not started LifeOS (`startedOn`,
`settledThrough` null); the frame seed is added by edit lists and schema-checked by
`fixture-schema-check.mjs` (17 bodies typed by `LifeosToday`, `TodayDay`, `NutritionDay`; tsc clean;
032 value ranges OK) under the orchestrator rulings of 2026-10-17 / 2026-10-18.

| # | Frame element | What the app does | Why |
|---|---|---|---|
| 1 | NAPI DOBÁS block (ma-1 "Lift helyett lépcső", ma-2 "Hideg zuhany", ma-4's pending draw with "Újradobás · 1" above MAI EDZÉS) | not drawn | Daily challenge is plan Phase 4 (no server). No teaser, no placeholder (D3, task: hide it). ma-4's subject is therefore unreachable; its other blocks are drawn, so everything below the hero sits higher than in the frame. |
| 2 | FÓKUSZ block (ma-1) | not drawn | Phase 6. |
| 3 | KÖVETKEZŐ block (ma-1, "Vacsora Annával") | not drawn | Phase 5 (calendar). |
| 4 | Bottom bar "Ma · Edzés · Étkezés · Naptár · Haladás · Profil" | "Ma · Edzés · Étkezés · Haladás · Profil" | Naptár is Phase 5; the first tab becomes "Ma" through R-S-ma-01. |
| 5 | ma-2 "Ma eddig +68" | "+53" | The frame's figure includes the +15 of the daily challenge (Phase 4); the app shows what the server says was earned. |
| 6 | ma-2 "Tökéletes nap · +25 érme napzáráskor" | "Tökéletes nap" | The amount is an admin rule a member cannot read (GET /admin/rules is admin-only); typing 25 would be fake data the moment a rule changes. Request R-S-ma-03 asks GET /lifeos/today for the rule figures. |
| 7 | ma-3 micro lines "+10 érme / nap · 7 nap után ×1,25" and "+5–20 érme teendőnként" under the empty states | not drawn | Same as 6 (R-S-ma-03). |
| 8 | ma-3 FELADATOK empty state "+ Rögzítés", FELADATOK "Rögzítés +" | open the capture sheet over Ma (fix round, R-S-ma-02 applied) | Resolved: S-tasks' CaptureSheet is merged. "Kész ma · N ›" opens Feladatok (/tasks, merged), whose first tab lists KÉSZ MA. |
| 9 | Habit check ring (24 pt, 2 pt stroke) | the kit CheckMark ring | pulse-shot's `boxed` probe counts the ring as an outlined surface (ma-1, ma-4, relapse sheet: 5 rings). The frame draws the same ring; it is a control mark, not a box. |
| 10 | Hero slash "/" 102 pt (ma-1) / 100 pt (ma-2) | 99 pt in every state | The two frames disagree with each other by 2 pt; the kit hero numeral uses one size. |
| 11 | ma-4 "Nyújtás 10 perc · Naponta · emlékeztető 21:30" | "Emlékeztető 21:30" (as ma-1 draws the same habit) | The frames disagree with each other; the row's sub line names the reminder only (ma-1's form). |
| 12 | Status bar clock / notch | the capture tool's chrome | Not part of the page. |

## States the frames do not draw (built in the same language, Q4)

- **Relapse confirmation** (`ma-relapse-sheet`): tapping a bad habit opens the kit ConfirmSheet
  ("Rögzítsem a visszaesést? …", "Igen, visszaestem" in danger, "Mégse") — it costs coins and ends
  the streak; f_app confirms it too.
- **LifeOS read failed** (`ma-failed`): the ledger line prints the dash; the hero keeps its label "MA"
  and the danger line with "Újra" (no giant figure: the display face's em dash at giant size is a
  solid slab that read as a loading bar — fix round); MAI EDZÉS, TÁPLÁLKOZÁS and the library row still work; SZOKÁSOK /
  FELADATOK are not drawn (no fake rows).
- **Running session** (`ma-live-session`, live seed): MAI EDZÉS shows "Edzés folyamatban" and
  "Folytatás" (the one lime pill). On the 031 freeze the hero reads 0/0 (no habits / tasks, the
  workout is not due on a free session).
- **Loading**: hero dash and row skeletons (TodayHabitsSkeleton); **backend without 032**: the two
  sections are not drawn and the hero counts the workout alone.
- **Tap failures**: a failed log / complete / reopen keeps the old state and shows the error toast.

## Moved from the Kezdőlap (owner 2026-10-17)

The week strip of the old Kezdőlap is not on Ma: no round-B frame draws it, and the calendar (Phase 5)
takes the week. Its query lives on in `useTodayPlan.ts` (`useWeekPlan`, used for ma-2's "Holnap: …").
HomeNutrition became TodayNutrition (compact Kalória / Fehérje); the Gyakorlatok row is last.
`features/home/` is deleted (HomePage, WeekStrip, HomeNutrition by this branch; useToday.ts, frozen,
through R-S-ma-01).

## Fix round (pulse/S-ma-fix, after the independent review `.pulse/review/S-ma/REVIEW.md`)

| Review # | Finding | Done |
|---|---|---|
| 3 (blocking) | "Rögzítés +", "+ Rögzítés", "Kész ma · N ›" did nothing (/tasks was not a route) | S-tasks is merged: both capture links open the CaptureSheet over Ma (`aria-haspopup="dialog"`; the sheet mounts at the first tap, so Ma does not read GET /tasks on every visit); "Kész ma · N ›" opens /tasks. New state `ma-capture-sheet`. |
| 7 (minor) | failed hero: a grey 104 × 16 slab; "Újra" ended at x 358 | the slab is gone (label + danger line); "Újra" keeps its 44 pt box (the targets probe measures the element) but sets its words at the right edge (`justify-end`, as "Összes ›"), so they end on the gutter. |
| 8 (minor) | "+ Első szokás" opened the Szokások list | it opens S-habits' HabitSheet in create mode over Ma (mounted per opening, so each new habit starts blank with its own idempotency key). New state `ma-habit-sheet`. |
| 1, 2 (blocking) | NAPI DOBÁS / FÓKUSZ / KÖVETKEZŐ missing; 5 tabs instead of 6 | not fixable here: phases 4 / 5 / 6 (the 6-tab bar arrives with S-calendar). |
| 4, 5 | "+68" / "· +25 érme napzáráskor" / the two ma-3 micro lines | still open: request R-S-ma-03 (no member route returns the rule figures; checked on pulse-redesign 05b830a: only GET /habits' `rules` carries freezeEvery / maxFreezes / partialHabitMinPct). |
| 6 | live "0/0" on a rest day with nothing due | unchanged: no frame draws it and any caption is new copy (R22) — copy question to the owner. |
| 9, 10 | slash 99 pt; ma-4 sub line | accepted (rows 10, 11 above). |
| 11 | `boxed` probe counts the check ring | tool allowance, not a page change (row 9 above). |

Integration note (merge-S-ma-fix): the branch was cut before B-rewards-challenges (033) made
`Task.challengeId` and `LifeosToday.challenge` required, so the fixture bodies failed the package's
tsc check on pulse-int. make-states.mjs now writes `challengeId: null` on every task and adds
`challenge: null` to GET /lifeos/today (Ma draws no NAPI DOBÁS yet); states.json is regenerated,
24 fixture bodies schema-checked, tsc clean.
