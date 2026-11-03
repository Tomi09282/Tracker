---
type: table
table: exercises
summary: 16 columns, 1652 rows
rows: 1652
tags: [data-model, generated]
---

# `exercises`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-12.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `name` | TEXT | NOT NULL |
| `normalized_name` | TEXT | NOT NULL |
| `description` | TEXT |  |
| `instructions` | TEXT |  |
| `status` | TEXT | NOT NULL, default 'private' |
| `owner_id` | INTEGER | → users.id |
| `rejection_reason` | TEXT |  |
| `submitted_at` | INTEGER |  |
| `source` | TEXT | NOT NULL, default 'custom' |
| `source_uid` | TEXT |  |
| `difficulty` | TEXT |  |
| `exercise_type` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |
| `deleted_at` | INTEGER |  |

## Foreign keys

- `owner_id` → `users.id` (on delete CASCADE)

## Indexes

- `exercises_source_uid_unique` (unique) (partial)
- `exercises_sort_idx`
- `exercises_owner_idx`
- `exercises_scope_idx`

## Triggers

- `exercises_updated_at`
- `trg_exercise_hard_delete_guard`

## Constraints

- `status IN ('global', 'private', 'pending_review', 'rejected'`
- `source IN ('wger', 'free-exercise-db', 'custom'`
- `difficulty IS NULL OR difficulty IN ('beginner', 'intermediate', 'advanced'`
- `exercise_type IS NULL OR exercise_type IN ('strength', 'stretching', 'cardio', 'mobility', 'plyometrics'`

Back to [[ERD]].

<!-- brain:keep -->

## Translations: coverage and the importer (hand-written, kept by brain-gen)

> [!note] Not generated
> Everything below the `brain:keep` marker is written by hand. `npm run brain:gen` lifts it off the
> old note and appends it to the regenerated one. Numbers are from 2026-11-04.

### What is in the library

A scratch database seeded from the live upstream datasets holds **1729** dataset exercises
(876 free-exercise-db, 853 wger); the older dev catalogue had 1652. The English side is uneven by
source: free-exercise-db rows have ordered steps and no description, wger rows have a description
and no steps. Of the 1729, **829** have an English description and **871** have English steps (29
have neither: a name only). A translation can only exist where the English has that kind of text.

### Coverage after `import:exercise-translations`

Measured on the seeded scratch database (seed-exercises, seed-translations, seed-taxonomy-i18n,
translate-exercises-hu, then the importer), as a share of all 1729 exercises. The last column is the
share of the exercises that have English text of that kind at all.

| language | name | description | instructions | description of those with English text | instructions of those with English steps |
|---|---|---|---|---|---|
| hu | 1729 (100%) | 829 (47.9%) | 871 (50.4%) | 829 / 829 (100%) | 871 / 871 (100%) |
| de | 1729 (100%) | 836 (48.4%) | 871 (50.4%) | 825 / 829 (99.5%) | 871 / 871 (100%) |

Before the import, hu had 883 names (the composed ones from `translate-exercises-hu.mjs`, origin
`machine`) and nothing else; de had 593 names and 581 descriptions (wger's own, origin `dataset`).
Four wger exercises keep an English description in German because their German row is a wger
`dataset` row with a name but no description, and the importer never writes into a `dataset` row.

### Where the text comes from

`backend/data/exercise-translations/hu.json` and `de.json`, machine-translated with Claude from the
English text, reviewed by sample, imported with `origin = 'machine'`. They are keyed by
`(source, source_uid)`, never by the numeric id, which differs between databases. The README next
to them records the provenance and the licence position: the wger-derived texts are adaptations of
CC-BY-SA 4.0 material and keep the attribution the app serves publicly at `GET /api/v1/sources`;
the free-exercise-db-derived texts come from an Unlicense source.

### The importer

`npm run import:exercise-translations -- [--dry] [--lang hu|de] [--limit N] [--json] [--dir <folder>]`
(`backend/scripts/import-exercise-translations.mjs`):

- matches `exercises` by `(source, source_uid)` (the partial unique index `exercises_source_uid_unique`);
- upserts `exercise_translations` only where **no row exists or the row is already `machine`**; a
  `human` or `dataset` row is never touched (checked in JavaScript and repeated in the SQL `WHERE`,
  so a human edit made between the read and the write still wins);
- fills `name`, `normalized_name` (the same `normalizeText` fold as every other script),
  `description` and `instructions` (a JSON array); the FTS rows follow from the
  `exercise_translations_fts_*` triggers;
- a field missing from an entry never erases a present one, and an entry without a name can only
  refine an existing machine row (it keeps the name) or is skipped;
- idempotent: a row already equal to the file is not written, not even an `updated_at` bump;
- all-or-nothing validation of the files (zod, `.strict()`, the same bounds as `TranslationBody`)
  before the first write; writes go through `writeTx` in chunks of 100;
- refuses a database without the translation tables, the unique indexes or the FTS triggers
  (exit 1, "run `npm run migrate`");
- reports per language: inserted, updated, unchanged, skipped-protected, skipped-no-name,
  unknown-exercise, and the coverage table above.

`npm run verify:import-translations` (part of `check:all`) runs the real importer as a child
process against a throwaway encrypted database and a throwaway server: refusals, dry run, counts,
protection of `human` and `dataset` rows, FTS, idempotence, and `GET /exercises` /
`GET /exercises/:id` answering in Hungarian and German with `translated = 1` (an exercise without a
row falls back to English with `translated = 0`).

To load a fresh database: `migrate`, `seed:exercises`, `seed:translations`, `seed:taxonomy-i18n`,
`translate-exercises-hu`, then `import:exercise-translations`. Enabling a language for users stays a
separate decision (`languages.enabled`); the importer does not touch it.
