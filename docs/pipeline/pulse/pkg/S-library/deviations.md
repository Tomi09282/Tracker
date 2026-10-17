# S-library — deviations taken under Q4 (behaviour wins over the frame)

Frames: library-1 / -2 / -3. Each line: what the frame draws, what the page does, why.

| # | Frame | Page | Why |
|---|---|---|---|
| DEV-1 | Rows carry a 48 pt equipment still (x 24) and the text at x 88, rows 68 high | Text-only rows: text at x 24, rows 64 high (pitch 65) | The list API (`GET /api/v1/exercises`) carries no equipment key, so no still can be chosen honestly; no placeholder square (brief must, media rule). A row with a real upload (`thumb_key`) gets a 48 pt `UserPhoto` lead. Request R-S-library-02 asks for the equipment slug in the list answer. |
| DEV-2 | Only the search glyph in the header | The glyph opens the search line (`SearchField`) as the header's child line, 4 under the title; it stays open while a term is typed; debounce 300 ms and the clear control (`library.clearSearch`) are kept | Free-text search exists today and may not disappear (Q4). The open line is not drawn: state `library-search`, verdict `structure`. |
| DEV-3 | No result count | The count ("N gyakorlat" / "Betöltés") is kept as an sr-only `role="status"` line | No frame draws it; it was never a total (rows loaded so far). Screen-reader users keep the announcement. |
| DEV-4 | Chips scoped to the side shown (front 13, back 11) | Same, as drawn | Today all 20 chips stood on both views. Every slug is reachable (one tap on Hátul; `full-body` stays on both). A muscle chosen on the other side stays the filter: subject line, clear link, filtered list, nothing lit (state `library-offside`). |
| DEV-5 | — | The difficulty dot (green / amber / red) before the difficulty word is gone | The frames print words only ("Profi · Erő"); a semantic colour on a row is not Pulse. The word carries the information. |
| DEV-6 | The frame premise keeps the selection on Back | The selection lives in memory and is lost when a detail is opened, as today | No URL state (R20). |
| DEV-7 | — | A failed list read still lands on "Nincs találat" (no retry) | Unchanged behaviour; no error title for this screen exists in hu.json (R22) — copy question, nothing invented. |
| DEV-8 | — | "Szűrők törlése" under the subject clears the MUSCLE only; the one in the empty state clears both | As today. |
| DEV-9 | — | The empty state's action is a text link (was a primary button) | This screen has no pill (frames); EmptyState keeps a text link on the left edge. |
| DEV-10 | — | A failed taxonomy read keeps the four word-sized skeleton blocks in the strip | As today; an optional repair (chips from `musclesOnSide` + `muscle.*` labels) needs an owner ruling. |

Copy: no string added, changed or removed. Literal consumers added for existing keys: `muscleMap.filterHint`, `muscleMap.front`, `muscleMap.back`, `muscleMap.viewLabel`. The `en` tag stays the literal language code it was.
