# S-tasks - deviations from the frames (owner answer Q4: behaviour wins over the frame)

Frames: `lifeos/tasks-1`, `lifeos/task-form`, `lifeos/capture` (design round B). Pairs: `.pulse/pairs/S-tasks/`.

| # | Frame | What the frame draws | What the app does | Why |
|---|---|---|---|---|
| 1 | all three | the LifeOS bottom bar: Ma · Edzés · Étkezés · Naptár · Haladás · Profil (six cells, "Ma" lit) | today's member bar: Kezdőlap · Edzés · Étkezés · Haladás · Profil (five cells, Kezdőlap lit) | The bar is P1-nav's and the Ma / Naptár tabs belong to S-ma and the calendar phase. Nothing of this package draws it. |
| 2 | capture | "Hova?" Feladat / Esemény with Esemény chosen, then "Kezdés" and "Emlékeztető 1 órával előtte" | no "Hova?" row: the capture always becomes a task; the time field is "Határidő ideje" and there is no reminder line, so the sheet is 108 pt shorter | An event needs the Phase-5 route (`POST /events`). The plan says to hide that option until then. A control that does nothing is never built (D3). |
| 3 | capture | Mikor? Ma · Holnap · Dátum | Ma · Holnap · Dátum · Bármikor | A task may have no deadline (`dueOn: null`, tasks-1's own tab "Bármikor"). Without the fourth choice a capture could not make an anytime task. The word is the existing key `tasks.tab.anytime`, so no copy is invented. |
| 4 | capture | the sheet over Ma (Szia!, the coin line, the 3 / 10 figure) | the sheet over Feladatok (`/tasks?capture=1`) | Ma is S-ma's page. `CaptureSheet` is exported for S-ma to mount from "Rögzítés +". |
| 5 | tasks-1 | "hétfőnként" under the done weekly task, "hetente" under the open one | "hetente" under both (the rule's kind) | The two tasks have the same rule shape (weekly, one weekday). Naming the weekday ("hétfőnként", "keddenként" ...) needs seven adverbs in three languages, and only one of them is in the frame. That would mean inventing copy (R22), so the word is the kind until the owner decides. This is a copy question. |
| 6 | all | 44 pt targets | four kit controls draw narrower boxes: the back link "Ma" (37 pt, ScreenHeader), the segmented word "Ma" (39 pt, E6Segmented), the chip "Ma" (39 pt, ChipRow), the weekday cells (27-43 pt, WeekdayChips) | Kit geometry, not this package's (S-habits shows the same back link). It is reported to the orchestrator. Widening them here would move the words off the frame. |
| 7 | task-form, capture | the text caret in the focused field | no caret in the capture | The caret blinks, and the capture catches it off. The focused underline is drawn. |
