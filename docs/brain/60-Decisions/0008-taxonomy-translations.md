---
type: decision
id: 0008
title: The taxonomy stops being bilingual
status: accepted
date: 2026-08-05
tags: [decision, i18n, data-model]
---

# 0008 — The taxonomy stops being bilingual

## Context

Migration 004 already won this argument once, for exercise names: a `name_hu` COLUMN makes every
new language a schema change plus a backfill plus a deploy, so exercise text moved to
`exercise_translations` and the app now carries 3056 rows across 22 languages.

The two taxonomy tables — `muscle_groups` and `equipment`, 36 rows between them — were left on
`name_en` / `name_hu` at the time. The cost was theoretical and the tables were small.

It stopped being theoretical at F11. The onboarding questionnaire asks the client to pick their
available equipment **by name**. On the old schema, a Polish client would have picked from an
English list, and the only route to fixing it would have been another migration.

There was also a second, quieter problem: the `lang === 'hu' ? name_hu : name_en` ternary had been
copy-pasted to three call sites (the taxonomy list, and the muscle and equipment rows on the
exercise detail). That is exactly how a UI ends up half-translated — two of the three get updated
and the third keeps serving English.

## Decision

Migration 007:

- `name_en` is renamed to `name` and becomes the canonical name, matching `exercises.name`.
- `name_hu` is **dropped**, so anything still reading it fails loudly instead of quietly serving
  English to a Hungarian client.
- One generic `taxonomy_translations (kind, ref_id, lang, name, origin)` table serves both
  taxonomies, with `kind` CHECK-bounded to the two known values.
- Resolution moves into `src/lib/taxonomy.js`, which is the only place the fallback chain is
  written: **requested language → instance default → canonical name**, with a `translated` flag
  returned alongside so the UI can mark a fallback rather than pretending.

One generic table rather than one per taxonomy: both are small lookup sets with an identical
shape, and the next taxonomy plugs in without another migration.

## Consequences

- Adding a language to the taxonomy is 36 rows of data. No migration, no deploy.
- `GET /taxonomies` now resolves server-side and returns one label per row instead of every
  language. The browser has no business receiving 22 labels to discard 21, and a list the client
  assembles is a list the client can get wrong.
- `scripts/seed-taxonomy-i18n.mjs` seeds de, es, fr, it and pl — 180 labels, written as
  `origin = 'machine'` because no native speaker has reviewed them. The other seventeen languages
  fall back to English and **report `translated: false`**, which is the truthful state.
- Those five stay **disabled** in `languages` until a UI bundle exists for them. A language that
  translates the exercise list but not the buttons around it is worse than one that was never
  offered. The seed script says so out loud when it runs.
- The seed gates on the language EXISTING, not on it being enabled — content is how a language
  gets ready to be switched on, so requiring it to be on first would be a deadlock.

Closes the Phase 1 open item "taxonomy per-language columns".

Related: [[0003-exercise-translations]] · [[ERD]] · [[Endpoints]]
