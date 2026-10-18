# B-calendar — the calendar, events and reminders (migration 034, plan Phase 5)

The contract the Naptár / esemény / Rögzítés (Esemény) / Ma (KÖVETKEZŐ) lanes build against.
TypeScript types: `frontend/src/lib/lifeos-api.ts` (the Phase-5 block arrives through `shared.patch`
in this folder). Server truth: `backend/src/lifeos/event-routes.js` and `events.js` (zod schemas),
`backend/src/lifeos/event-times.js` (the wall clock -> instants conversion, the stored rule),
`backend/src/lifeos/occurrences.js` (the occurrence engine and the reminder plan, pure),
`backend/src/lifeos/reminders.js` (when reminders run), `backend/src/db/tx/lifeos-events.js` (the
transactions), `backend/src/db/lifeos-calendar.js` (the shared reads),
`backend/src/db/migrations/034_lifeos_calendar.sql`. The core and the habits / tasks contracts are
unchanged: `docs/pipeline/pulse/pkg/B-core/api.md`, `docs/pipeline/pulse/pkg/B-habits-tasks/api.md`.

House rules as before: `/api/v1`, cookie auth, `X-CSRF: 1` on writes, `{ error, code, requestId }`,
every body / query `.strict()` (an unknown key is a 400). **The calendar moves no coins** (f_app:
"Calendar events ... No points involved"); the workout row's "+30 érme" is the existing workout award.

## The model in four sentences

- An event is written as a **wall clock** — a date, a start and an end time — and the server
  resolves the instants in the user's zone (`user_prefs.timezone`). No client sends an instant, an
  offset or "today".
- A **recurring** event keeps its LOCAL start time on every occurrence day and its elapsed length:
  a weekly 18:00 Budapest event is 16:00Z in October and 17:00Z after 25 October. On the spring
  day a 02:30 that does not exist starts at 03:30; on the autumn day the doubled 02:30 is the first.
- An **all-day** event is a run of local dates (at most 14), the same dates for every viewer.
- Events follow the **calendar day** (midnight), as the workout schedule does; tasks keep their
  logical due day and are drawn on the calendar day of the same date.

## GET /calendar?from=YYYY-MM-DD&days=1..42 → `CalendarResponse`

Both optional: `from` = the calendar today, `days` = 7 (the DayRail week sends the Monday and 7).
`from` must be within ~10 years of today (else 400). Settles due LifeOS days first (as `/tasks`).

```json
{ "started": true, "timezone": "Europe/Budapest", "today": "2026-10-21", "logicalToday": "2026-10-21",
  "from": "2026-10-19", "to": "2026-10-25",
  "days": [ { "date": "2026-10-21",
    "events": [ { "eventId": 12, "date": "2026-10-21", "occurrenceDate": "2026-10-21", "title": "Fogorvos",
                  "location": "Dr. Kiss Anna · Bartók Béla út 12.", "allDay": false,
                  "startAt": 1792569600, "endAt": 1792572300, "startTime": "10:00", "endTime": "10:45",
                  "durationMinutes": 45, "startsBefore": false, "endsAfter": false,
                  "recurrence": null, "untilDate": null } ],
    "workouts": [ { "planId": 3, "planName": "PPL", "dayId": 9, "dayName": "Felsőtest – húzás", "isRest": false,
                    "estMinutes": 60, "startTime": "18:00", "exerciseCount": 5, "logId": null, "logStatus": null } ],
    "tasks": { "due": [ "Task …" ], "completed": [], "overdue": [] },
    "busy": true } ],
  "anytime": [ "Task …" ],
  "workoutPointsFull": 30 }
```

Per day: `events` (all-day first, then by start; a multi-day occurrence is on every day it touches,
with `startsBefore` / `endsAfter`), `workouts` (the plan schedule's occurrences, rest days included —
`isRest` is "Pihenőnap – nincs ütemezett edzés."), `tasks.due` (open, due that day, by time),
`tasks.completed` (completed that day), `tasks.overdue` (only on the logical today). `busy` is the
DayRail dot: an event, a non-rest workout, or a task due / done that day. `anytime` = the open
undated tasks ("Bármikor"), once. TEENDŐK "N nyitott" on a day = `due.length + anytime.length`.
Task objects are the B-habits-tasks `Task` (complete / reopen through `/tasks/:id/...`).

## GET /events/:id?on=YYYY-MM-DD → `{ event }` (`CalendarEvent`)

`{ id, title, notes, location, allDay, date, startTime, endDate, endTime, durationMinutes, timezone,
recurrence, untilDate, reminders, startAt, endAt, next, remaining, occurrence, createdAt, updatedAt }`.
The typed fields are in the event's own `timezone`. `next` = the first occurrence that has not
ended; `remaining` = occurrences from today through `untilDate` ("December 19-ig · még 9
alkalom"), null without an until date; `occurrence` = the one on `?on=` (event-detail opened from a
calendar day: "SZOMBAT, OKTÓBER 24. 09:00 – 10:00"), null when none. Another account's event: 404.

## POST /events → 201 `{ event }` (200 `{ event, replayed: true }` on a replayed key)

```json
{ "clientKey": "evt-…", "title": "Fodrász", "date": "2026-10-21", "startTime": "16:00", "endTime": "16:45",
  "location": "Hajszalon · Király utca 26.", "recurrence": null, "reminders": [15, 1440] }
```

| field | rule |
|---|---|
| `clientKey` | 8..64 of `[A-Za-z0-9_-]`; the same key answers the first event whatever the body |
| `title` | 1..120, no control characters |
| `notes` | 1..1000 or null (line breaks allowed) |
| `location` | 1..160 or null |
| `allDay` | default false. All-day: no `startTime` / `endTime`; `endDate` = the LAST day (inclusive, default `date`) |
| `date` | the first local day; within ~10 years of today |
| `startTime` | `HH:MM`, required unless all-day |
| `endTime` | `HH:MM` or null (null = a zero-length event). With no `endDate`, an end time before the start ends after midnight (22:00–01:00 = 3 h) |
| `endDate` | the day the end falls on (timed) / the last day (all-day) |
| `recurrence` | `{type:'daily', interval?:1..30}` · `{type:'weekly', weekdayMask:1..127}` (bit0 = Monday) · `{type:'monthly', day:1..31}` (clamped) · `{type:'yearly'}` (the first date's month and day; 29 Feb → 28 Feb in a common year) · null |
| `untilDate` | the last day a rule may produce (inclusive); needs `recurrence`; ≥ `date`; ≤ `date` + ~10 years |
| `reminders` | offsets in minutes before the start, 0..10080, at most 4, no repeats. The form: Kezdéskor 0 · 15 perc 15 · 1 óra 60 · 1 nap 1440 |

Nothing lasts longer than 14 days (400). **Capture (Rögzítés · Esemény) is this call.**

## PATCH /events/:id → `{ event }`

Any create field except `clientKey` (at least one). The time fields are merged over the stored ones
and resolved again in the user's CURRENT zone; a move that names no end keeps the length (10:00–10:45
moved to 11:00 is 11:00–11:45; an all-day run keeps its number of days). `reminders` replaces the
set. `recurrence: null` drops the rule and its until date. Every occurrence moves with the event:
editing or deleting ONE occurrence of a recurring event is not supported (plan risk 6, README open
question 5) — the screens should not offer "Csak ez az alkalom".

## DELETE /events/:id → 204

Deletes the event with every occurrence and reminder ("Esemény törlése"). Reminder notifications
already delivered stay in the bell. A second delete is 404.

## Errors

`401` anonymous · `403` no `X-CSRF` · `400 validation_error` (also an impossible time combination,
an out-of-range date, a 15-day event) · `404 not_found` (also another account's event) · `409`:
`TIMEZONE_REQUIRED` (before the browser zone was sent), `LIMIT_REACHED` + `limit: 500` (the 501st
event). Limits: reads 600 / 15 min per IP; writes 300 per IP and 200 per account.

## GET /lifeos/today — Phase-5 field

```json
{ "nextEvent": { "eventId": 14, "date": "2026-10-19", "title": "Vacsora Annával", "location": null, "allDay": false,
                 "startAt": 1792430000, "endAt": 1792437200, "startTime": "19:30", "endTime": "21:30", "recurring": false } }
```

Ma's KÖVETKEZŐ line: the next occurrence that STARTS after now, within 7 calendar days, or `null`.
An event already running is not "next".

## Reminders without push (`materializeRemindersTx`)

There is no scheduler and no push: **a reminder appears in the bell when the app asks** — on
`GET /lifeos/today` and on the bell's unread poll `GET /notifications/unread-count` (at most once
per 2 minutes per user and process; an event write resets that). event-detail's "Értesítés a
csengő alatt" is exactly this. Delivered once, deduplicated by `reminder_deliveries`:

| kind | due when | notification |
|---|---|---|
| event offset | fire = occurrence start − offset, fired within the last **6 h**, the occurrence not over (a zero-length event counts 30 min) | `type 'lifeos.event'`, title = the event's title, body = `"16:00–16:45 · Hajszalon"` (time range · place; all-day: the place or nothing), link `/calendar/events/<id>` |
| habit reminder time | a live GOOD habit scheduled that logical day (today, or yesterday until it settles), not done or skipped, its `reminderTime` fired within 6 h | `type 'lifeos.habit'`, title = the habit's name, body = `"21:30"`, link `/habits/<id>` |
| task due | an open, timed, non-template task whose due instant is ahead and at most 60 minutes away | `type 'lifeos.task'`, title = the task's title, body = `"15:00"` (the due time), link `/tasks` |

When several offsets of ONE occurrence are due at once (the app opened 5 minutes before a meeting
with 15 min / 1 h / 1 day reminders), only the latest (15 min) is delivered; the others are recorded
as superseded and never arrive late. At most 20 notifications per run (the rest on the next poll).
The server writes no words of its own: titles are the user's items, bodies are clock figures and
the user's place. The bell's glyph for `lifeos.*` is the type map's fallback until a lane adds one.
Delivery records older than 14 days are pruned (the dedupe only matters inside the 6 h window).

## GDPR

The export adds `events`, `event_reminders`, `reminder_deliveries`. An account erasure cascades
through all three (user FK), and through the notifications the reminders wrote.
