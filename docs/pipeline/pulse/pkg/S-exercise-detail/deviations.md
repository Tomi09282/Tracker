# S-exercise-detail — deviations taken under Q4 (behaviour wins over the frame)

Frames: exercise-detail-1 / -2 (both catalogue rows, no media, approved, translated). Each line: what
the frame draws, what the page does, why. States: `states.json` (captures in
`.pulse/shots/S-exercise-detail/`).

| # | Frame | Page | Why |
|---|---|---|---|
| DEV-1 | No moderation notice | A rejected submission shows `NoticeLine tone="danger"` ("Ezt a beküldést elutasították") with the moderator's reason as its detail line, never cut; a pending one `NoticeLine tone="info"` ("Beküldve — moderálásra vár."). Its own block directly under the header (it used to sit between the back link and the title; in Pulse the header is one block) | The author must see the outcome of a submission (behaviour exists today). States `ed-rejected`, `ed-pending`, live as coach@. |
| DEV-2 | No uploaded media (the mannequin is the picture) | The first upload, when there is one, is a `UserPhoto` 16:9 block between the header (or notice) and the stage, full content width, no radius; with an image, Eszköz is not rendered (unchanged rule: the photo shows the gear). The empty-slot dumbbell glyph of the old page is gone (no upload = no block). A video upload keeps the one-way player: the first frame as poster with ONE bare Play glyph (`Pressable variant="link" shape="icon"`, `library.playVideo`) centred, no ring, no scrim; from the first tap the native controls | Uploads exist (the seed's two demo submissions carry an image). The seed's images are tiny dark placeholders, so the block reads as an empty band in `ed-pending` / `ed-dark-view` — that is the data. No exercise can carry a video today (uploads ingest images only): the video branch is verified by reading (`structure`); the legibility of a bare glyph over an arbitrary poster is an open question for the owner. |
| DEV-3 | Meta "Kezdő · Erő" only | When the exercise text is not in the interface language (`translated 0`, interface not en) the language codes ("EN / HU", or "EN" when none is listed) follow as the meta line's last item, mono (`text-data`) in the warning ink — text, no box | Saying that a text is untranslated is today's behaviour (was an amber outlined chip). State `ed-lang-mark` (de, live row 80) and the two submissions (EN). |
| DEV-4 | — | No steps but a description: one paragraph under a strong rule, NO heading | Today's behaviour; no heading word exists in the copy, none is invented (R22). State `ed-description` (fixture edit over the recorded bench press). |
| DEV-5 | — | No muscle tagged: no stage, no figure, no switch; Eszköz becomes a ruled section of its own (strong rule, eyebrow, the same rows) | State `ed-no-muscles`. |
| DEV-6 | — | Not found / failed read / not allowed: `EmptyState` h1 "Nincs találat" under the pushed header; the header's back control (a real link "Gyakorlatok") is the way out; the old secondary "Gyakorlatok" button is not repeated under it | The way back stays (same destination, `/library`); one state for three causes and no retry is the known defect, unchanged. State `ed-not-found` (live 404). |
| DEV-7 | — | Loading: the real back row, a display-line and a meta-line block, three key-line blocks, then one ruled section of blocks; no figure block | Images are withheld, never drawn as grey squares (structure kit rule). Held in a replay only through the non-numeric id (known defect: `/library/abc` stays loading). State `ed-loading`. |
| DEV-8 | The equipment row shows a 48 pt still | A slug without a still (`medicine-ball`, `stability-ball`, `foam-roller`, `other`) is the name alone; in a list where another row has a still it keeps the same text edge (`leadSlot`) | `EQUIPMENT_STILL` is the only source (brief must). |
| DEV-9 | Many muscles not drawn | The stage is at least 404 tall and grows: Eszköz stands on the figure's foot line while the key is short, and moves down when the key and caption need the room (never overlaps) | The frames fix 404 for three labels; the API allows more. |
| DEV-10 | Caption "További célizmok a elöl nézetben." (frame 2) | Printed exactly as the product prints it | The grammar ("a elöl" instead of "az elülső") is the `muscleMap.alsoOnOtherSide` key of the mannequin lane; frame 2 draws it 1:1. Copy question, not fixed here. |

Kit gaps built by the screen (non-blocking requests, `requests/`):

- The substitute strip (`ColumnStrip`, kit gap row "ColumnStrip"): router links 136 wide, min 64 high, a 1 pt hairline
  (`bg-hair`) mid-gap 16 + 1 + 16, scrolling inside itself and bleeding to both screen edges (`-mx-6 px-6`, 16 below
  376 pt), no scrollbar; pressed = opacity 60 %. R-S-exercise-detail-01.
- The title's balanced break (exercise-detail-1 breaks "KÖZEPES FOGÁSÚ / FEKVENYOMÁS RÚDDAL"; the natural wrap puts
  "FEKVENYOMÁS" on line 1): the page passes the title as `<span className="block text-balance">` to `ScreenHeader`.
  A `balance` default in `ScreenHeader` would serve every pushed screen. R-S-exercise-detail-02.

Copy: no string added, changed or removed. New literal consumers of existing keys: `muscleMap.viewLabel`,
`muscleMap.front`, `muscleMap.back`, `muscleMap.primary` / `muscleMap.secondary` (the role key's accessible names),
`muscleMap.alsoOnOtherSide`. `library.emptyTitle`, `library.rejectedTitle`, `library.pendingReview`,
`library.playVideo`, `library.howTo`, `library.equipment`, `library.muscle`, `library.substitutions`,
`library.difficulty.*`, `library.type.*`, `nav.library` (through `routeMeta`), `common.loading` keep their consumer.
