# S-notifications — deviations taken under Q4 (behaviour wins) and frame differences

For INT to append to `docs/pipeline/pulse/deviations.md` (numbers are INT's to assign). Frames: notifications-1
(arrival, 2 unread), notifications-2 (empty).

## Behaviour that the frames do not draw, kept in a Pulse form

| # | Behaviour (base) | Pulse form taken | Needs a ruling? |
|---|---|---|---|
| 1 | The way back is `navigate(-1)` (the bell lives on Home AND on `/coach`) | `ScreenHeader kind="push"` with `back={{ onClick: () => navigate(-1), label: t('nav.home') }}`: the frame's "‹ KEZDŐLAP", the history as the step. The control's accessible name is now "KEZDŐLAP" instead of "Vissza" (the only inventory change, every state: -1 "Vissza" +1 "KEZDŐLAP"). A coach who came from `/coach` reads "KEZDŐLAP" but returns to `/coach` | yes — the label is wrong for a coach; a real fix needs the two bells (frozen files) to pass where they came from |
| 2 | The automatic mark-read on arrival, the arrival count frozen for the visit | unchanged code above the return; `Numeral` static (no roll), the pill busy for one round trip | no |
| 3 | The pill disabled while offline | `Pressable variant="primary" size="lg" disabled` = the quiet grey primary (state notifications-offline) | no |
| 4 | Settled / nothing-unread / only-unread / error / mark-failed / loading — undrawn | composed from the kit (states.json; pictures in .pulse/pairs/S-notifications/_contact-states.png) | no |
| 5 | Error retry | `TextLink text="body"` "Újra" under the error title (no second pill), 44 pt wide target | no |
| 6 | The stat block | composed in the page (`data-kit="statBlock"`, numeral in a 100 pt slot + body caption) because the kit `StatBlock` requires an eyebrow and sets its caption at `cap` 13 — the frame draws no eyebrow and a 16/22 caption | kit request (optional `label` + a body caption) if a second screen needs it |

## Removed on purpose (the frame wins; nothing a user can DO is lost)

| What | Why |
|---|---|
| The bell glyph / tinted disc above the numeral, the struck "silent" bell at 0 | not in the frames; the numeral is the anchor (0 is drawn at the off level) |
| The check glyph inside the pill | not in the frames |
| The read check mark on read rows | not in the frames; read rows carry the age in `text-2`, unread rows the lime dot + age in `text-1` |
| `MessageSquare` row glyph | replaced by `MessageCircle` (the frame's glyph; the kit has no `message-square`) |

## Frame differences that stay

| Difference | Why |
|---|---|
| The Kezdőlap tab is lit (frame: no tab lit) | Q6 = (a), owner answer; shell, not this package |
| Frame 1 rows are a fixture | the recorded member inbox holds kinds no server code emits; the frame draws the two real kinds — verdict `matched-fixture` |
