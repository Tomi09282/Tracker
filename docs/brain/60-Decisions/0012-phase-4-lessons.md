---
type: decision
title: Phase 4 lessons — nutrition, health data, and four second-implementations
status: accepted
date: 2026-08-06
tags: [phase-4, lessons, nutrition, privacy, gdpr]
---

# Phase 4 lessons

Distilled at the phase close so the hot file can be pruned. Same job as [[0011-phase-3-lessons]].

## The recurring failure got a name this phase: I keep writing the second implementation

Phase 3 recorded it once (`cues.ts` re-solving `lib/haptics.ts`). Phase 4 did it **four times**,
which is enough to stop calling it an accident.

| I wrote | It already existed as |
|---|---|
| a food-visibility predicate | `exercises/visibility.js` — same bug, same words in its header |
| an inline `"${q}"*` FTS escape | `lib/normalize.js` → `toFtsQuery`, which also tokenises |
| a language-free `foods` search | the translations + fallback join in `exercises/routes.js` |
| a share predicate patched with `.replaceAll` | the lesson from the *first* row, an hour earlier |

Three of the four existing versions were **better than mine**. `visibility.js` carried two
conditions I had missed (`status <> 'draft'`, and the link still being active). `toFtsQuery` handles
multi-word queries mine could not. The exercise search already knew about the fallback language.

The tell, both times it has been written down: **when I find myself carefully handling a fiddly
edge — an iOS limitation, an FTS metacharacter, a diacritic — the edge has been handled already.**
Careful handling of a known-hard problem is evidence somebody has been here, not evidence of rigour.

## A gate that only checks one direction has a blind side

`check-i18n` opens by explaining the exact defect it exists to prevent: *"a missing key does not
throw — i18next renders the key PATH."* Every check under that header then compared the bundles to
**each other**. Nothing compared the CODE to the bundles, so `t('common.add')`, referenced by three
new components and present in no bundle, passed cleanly while a button rendered `common.add`.

That is the second blind side in the same file: `NATIVE_LABELS` guarded three keys that had moved,
so it passed forever while checking nothing.

Both were found the same way — **in a browser, looking at the thing.** The gate is now bidirectional
and was proven by deleting the key and watching it fail by file and line.

## Health data changes the default, and the default is nobody

Every other feature answers "may this coach see this?" with "yes, while the link is active". For
measurements and photos the answer is "only if the client said so, and only the part they said."

The privacy model is four conditions in ONE predicate: the share row exists, the specific flag is
set, it has not been revoked, **and the link is still active**. The fourth is the one a design
arrives at only by asking "what if the client never revokes?" — a coach who leaves keeps reading
somebody's body photographs forever under a `revoked_at`-only design.

Two flags rather than one, because "my coach can see my waist measurement" and "my coach can see
photographs of my body" are different consents and a single toggle forces the more sensitive to
ride along with the less.

**Every photo read is logged before the bytes go out** — not after, because a stream that fails
halfway was still a look, and a log recording only completed transfers can be defeated by
disconnecting. The viewer's email is snapshot into the row, so the answer survives that viewer
deleting their account, and the log outlives the photo.

And the same reasoning stopped the coach getting a food-log read for free: it was not built,
because it needs the same explicit consent design, and *coaching seems to imply it* is not a reason.

## SQLite CHECKs, the third reminder

013 established that a wrong CHECK is a 12-step table rebuild. Phase 4 applied it twice, in advance:

- **The measurement vocabulary is a reference TABLE with an FK**, not `CHECK (metric IN (...))`.
  Adding "forearm" a year from now is an INSERT. The plausible ranges live there too, enforced by a
  trigger, so a bound that excludes a real person is an UPDATE.
- **No Atwater CHECK on foods** (`4·protein + 4·carb + 9·fat ≈ kcal`). Tempting, and wrong — and
  the seed *proved* it rather than the comment merely claiming it. The generator reports outliers
  instead of enforcing them, and three fired immediately: beer, wine (ethanol is 7 kcal/g and is
  not a macro) and ground paprika (fibre).

## Snapshots record what the WRITER saw — including the language

`meal_items` and `nutrition_log_items` snapshot the food's name and macros so a food correction
cannot rewrite a prescription or a diary. That was right. What was wrong was *which* name: it came
from `foods.name`, the canonical English fallback, so a Hungarian user logged **Zabpehely** and
their own diary said **Oats, rolled, dry**.

A snapshot preserves what this said when it was recorded, which is a statement about the person who
recorded it. The language is theirs. It does not retranslate later either — a coach who prescribed
in Hungarian and switches the app to English still sees what they wrote, because the row is a
record of a past act rather than a live view of a food.

## Numbers that must not lie

- **Totals are never stored.** A day's kcal is `SUM()` at read time. A stored total is a number a
  client could eventually talk the server into writing, and a rollup is a second copy of a fact.
- **Macros are integers in a fixed scale**, never REAL. Summing 40 floats against a target is how a
  day reads 1999.9999 against 2000.
- **The client never sends a macro.** `INSERT ... SELECT ... FROM foods` copies them from the
  server's own row in the same statement. Sending one is a **400, not an ignore.**
- **A macro bar clamps its fill, never its label**, and past the target turns *warning*, not
  *danger*. Someone 300 kcal over has had a normal Tuesday.
- **Body charts are `direction="neutral"`.** The app does not know whether +3 kg is a bulk going
  well or a month going badly, and a green number answers that on somebody's behalf.
- **The importer's counter is computed by difference**, not per row: an upsert reports
  `changes = 1` either way, so a per-row check reports "all new" on every re-import. A number that
  is always the flattering one is not a measurement.

## Removing the surface beats guarding it

T4.1.4 asked for an SSRF guard on outbound USDA fetches. The strongest form of that guard is not
making the request: the importer reads a local file, and the product ships no outbound HTTP client,
no API key, and no code path where a URL reaches a fetch. It also makes food search work offline,
which for a Capacitor app used in gym basements is the better argument anyway.

## The compiler as a reviewer

Wiring the last client-detail tab narrowed `tab` to `never` in the fallback branch, and the
"arrives in phase N" placeholder stopped compiling. A placeholder that outlives what it was waiting
for is the same shape as the dashboard comment that still claimed nothing logs a workout — except
this one had a type system watching it. Worth arranging that on purpose where it is cheap.

## The evidence rules, unchanged at six

1. A test never seen to fail is not evidence.
2. A screenshot is evidence of a frame; a measurement is evidence of a fact.
3. An audit you run once is a snapshot; a gate is what keeps being true.
4. An audit must not carry its own copy of what it audits.
5. A path exercised only one way is one untested branch from never having worked.
6. A probe never seen to fire cannot be told apart from a clean subject.

Phase 4 adds no seventh, but it adds a corollary to the third: **a gate is only a gate in the
directions it checks.**
