---
type: adr
title: ADR-0024 The logical day - the user's wall clock, a chosen start hour, a lazy settle
status: accepted
date: 2026-11-03
tags: [decision, adr, lifeos, dates, timezone, backend]
---

# ADR-0024 — The logical day boundary

**Context.** Habits, tasks, the daily challenge, the earn cap and the day close all ask "which day
is it for this user". A UTC date is wrong for every user east or west of Greenwich; the server's own
zone is wrong for everyone not in it; and people who go to bed after midnight expect 00:30 to still be
"today". [[0022-lifeos-gamification-and-one-currency]] point 5 recorded the outline; this note is the
rule as built (B-core, migration 031; B-habits-tasks 032).

## Decision

1. **The day is the user's.** `user_prefs` holds an IANA timezone and a day start hour (00 / 02 / 04
   / 06; default 04). A day key is `YYYY-MM-DD` in the user's own calendar. Without a timezone no
   LifeOS item can be created (`409 TIMEZONE_REQUIRED`); the screen "Nap és időzóna"
   (`/settings/day`) sets it. The zone changes at most once per 24 h, and every change is audited.
2. **Wall clock, not elapsed hours** (`backend/src/lifeos/dates.js`): an instant belongs to its local
   date when its local hour is >= the start hour, otherwise to the day before. This differs from
   f_app on the two DST Sundays on purpose; `verify-lifeos-rules.mjs` pins the vectors.
3. **One implementation**: the routes and the named worker transactions import the same pure
   `dates.js`, and every transaction re-decides due-ness under its own write lock.
4. **Lazy settle, no scheduler** (`settle.js`): a day settles at start(next day) + 6 h, the first
   time the user's own requests ask (`GET /lifeos/today`, `GET /coins/wallet`, every LifeOS route).
   At most 7 past days settle with coins; older gaps settle as `lapsed` (no coins, no penalty).
   Two concurrent settles collide on `daily_summaries`' primary key; the loser pays nothing.
5. **The client never sends a date that pays.** Due dates and "late" are recomputed on the server.

## Consequences

- Moving the timezone backwards must not replay a day; the LifeOS security review attacked exactly
  that (`.pulse/review/security-lifeos/attacks/02-timezone-back.mjs`, `02b-tz-back-focus.mjs`).
- Haladás > Napok (`GET /lifeos/days`) shows settled days; a day before the LifeOS start day draws
  no row and a lapsed day draws no bar.
- Reminders and focus blocks use the same day key, so "today" agrees on every screen.
