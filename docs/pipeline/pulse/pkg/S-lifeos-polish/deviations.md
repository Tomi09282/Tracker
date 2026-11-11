# S-lifeos-polish - what is still different from the frames, and the questions it leaves

Pair pictures (app | Figma | difference): `.pulse/pairs/S-lifeos-polish/<package>.<state>.frame-app-diff-<n>.png`
(captures of the built app, replay, 402 pt, scale 2, in `.pulse/shots/S-lifeos-polish/final/<package>/`).

## Frame by frame (after this round)

| Frame | Verdict | What is still different |
|---|---|---|
| lifeos/ma-1 | matched-fixture | the WHOLE frame now composes (NAPI DOBÁS elvállalva after FELADATOK, FÓKUSZ "ma 50 perc", KÖVETKEZŐ with "emlékeztető 18:30"; the picked challenge's task is no FELADATOK row and not in 3/10). Nyújtás reads "Naponta · emlékeztető 21:30" (the words of habits-1 / ma-4; ma-1 itself draws "Emlékeztető 21:30" - the frames disagree, see question 2). Text rows 1-3 pt off (kit line boxes). |
| lifeos/ma-2 | matched-fixture | "+68" (the done challenge's +15 is in the fixture) and "Tökéletes nap · +25 érme napzáráskor" (dayRules) match. The app draws a FÓKUSZ door section ("ma 0 perc / Fókusz indítása") the frame does not (question 1). |
| lifeos/ma-3 | matched-fixture | both pay lines under the empty states are drawn from taskRules / dayRules. Same extra FÓKUSZ door (question 1). |
| lifeos/ma-4 | matched-fixture | NAPI DOBÁS above MAI EDZÉS matches; sub lines are the category only (no time-of-day field in the API, S-challenges deviation 3); the extra FÓKUSZ door. |
| lifeos/capture (Esemény) | matched-fixture | opened OVER Ma from Ma, words typed, Esemény, Dátum Szerda okt. 21., Kezdés 10:00, "Emlékeztető 1 órával előtte": rows within 1-2 pt of the frame. |
| lifeos/event-form | matched-fixture | the sheet top is the frame's (189 pt), the Naptár header and month line stand above it; Jegyzet scrolls below the first view; Dátum has no chevron. Residual: the rows from Megnevezés to Helyszín stand ~5 pt higher than the frame, the bottom (Emlékeztető, Mentés) is on the frame's line. |
| lifeos/focus-3 | matched-fixture | "3/3" is one ink (Fraction complete, R-S-lifeos-polish-04); the SZINT bar's fill rows are pixel-equal to the frame (1144-1151 px). |
| lifeos/focus-1, focus-2 | matched-fixture | unchanged: chips 1-3 pt left (kit ChipRow gap), clock digits without the frame's -1.24 px tracking (kit Countdown). The duration chips wrap (360 pt German). |
| lifeos/progress-days | matched-fixture | unchanged (text rows ~1 pt high, kit). |
| lifeos/tasks-1, task-form | matched-fixture | task-form prints "Alacsony · 5 / Közepes · 10 / Fontos · 20" from GET /tasks taskRules on real data (it was bare words). |
| lifeos/rewards-1, reward-detail, reward-form, habits-1, habit-detail, habit-form, challenges-1/-2, calendar-1/-2, event-detail | unchanged verdicts | no code change in these screens beyond the shared fixes. |

## Not done, and why (owner or kit decisions, nothing invented)

1. **FÓKUSZ door when no block is planned** (ma-2, ma-3, ma-4 do not draw FÓKUSZ; ma-1 does, with a planned block and 50 minutes). The server always sends `focus`, so Ma draws the door "Fókusz indítása" for every user; without it /focus would have no entry. Owner: keep the door (current), or draw FÓKUSZ only once a block exists and put the door elsewhere.
2. **Nyújtás sub line**: ma-1 draws "Emlékeztető 21:30", ma-4 and habits-1 "Naponta · emlékeztető 21:30". Followed ma-4 / habits-1 and the round's task (one wording on both screens).
3. **Befejezés before the end has no confirmation** (S-focus review 7): it pays only the elapsed minutes and cannot be undone; the frame draws none. Owner decides whether an early Befejezés asks first.
4. **TÁPLÁLKOZÁS leaves Ma when nothing is logged and there is no target** (S-ma-fix 9) and **0/0 on a rest day with nothing due** (S-ma-fix 8): owner copy questions, unchanged.
5. **Haladás > Napok**: D6 (a new user's page ends after four "0" rows - needs a sentence), D8 (today's column reads 0 for a habit-only day until the close: GET /lifeos/stats could add the habits' preview), D9 (the look of a lapsed day: drawn without a bar for now). Owner.
6. **Víz ×1,25 in habits-1 (DEV-b) and NAPOK 69/77 vs 69/78 (DEV-c)**: unchanged, a server rule and a fixture window.
7. **Kit items** (not S-lifeos-polish's files): chips drift (ChipRow gap), Countdown digit tracking, text-box line rounding (~1 pt rows). Requests R-S-lifeos-polish-02 (back control 44 pt wide) and -04 (Fraction complete) are patches; -01 and -03 are tool patches.
8. **A tap on a draw option opens MAI DOBÁS** (frame copy "Koppints egyre: ma ez a küldetésed.") - behaviour decided earlier (S-challenges deviation 1); unchanged.

## Taken in this round (Q4 log)

- The Ma lines "+N érme / nap · N nap után ×N", "+N–N érme teendőnként" and "· +N érme napzáráskor" quote `dayRules` / `taskRules`; without the fields nothing is printed (no constants). `dayRules` is a new additive field of GET /lifeos/today (backend/src/lifeos/rules.js dayPointRules, smoke 806 passed): the figures were on no member route.
- `today.habit.reminder` is removed (its only consumer now prints habits.scheduleDaily + habits.reminderAt).
- The focus mutations run with `networkMode: 'always'`: offline they fail at once instead of waiting and starting the block later (S-focus review 6).
