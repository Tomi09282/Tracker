# Exercise translations (hu, de)

`hu.json` and `de.json` are the shipped Hungarian and German texts for the global exercise
library: the exercise **name**, **description** and **instructions** (an ordered list of steps).
`backend/scripts/import-exercise-translations.mjs` loads them into `exercise_translations`
(`npm run import:exercise-translations`).

## Format

```json
{ "<source>": { "<source_uid>": { "name": "...", "description": "...", "instructions": ["...", "..."] } } }
```

- `<source>` is `free-exercise-db` or `wger`; `<source_uid>` is `exercises.source_uid`.
  The pair is the exercise's stable identity (`exercises_source_uid_unique`). The numeric
  `exercises.id` is **not** used: it differs between databases.
- Every field is optional, but an entry carries at least one. An absent field means "no
  translation for this part", not "empty": the API then falls back to the next language and
  finally to the English text.
- Bounds are the ones `TranslationBody` in `src/exercises/routes.js` enforces on hand-typed
  translations (name 2..120 characters, description <= 4000, at most 30 steps of <= 600).

## Provenance

- **How the text was made:** machine-translated with Claude (Anthropic) from the English text in
  the library, using a fixed glossary (muscle and equipment labels from `taxonomy_translations`,
  the curated Hungarian movement vocabulary), in batches of 40 exercises, and **reviewed by
  sample** - not line by line by a native speaker. Every row therefore enters the database with
  `origin = 'machine'`, which is how a reader (and the admin UI) can tell it apart from text a
  coach typed (`human`) or a dataset published (`dataset`).
- **What is covered:** every exercise that had no translation in that language yet. Names already
  published by wger (German) or composed by `translate-exercises-hu.mjs` (Hungarian) were kept
  unless the machine pass improved them; wger's own German rows (`origin = 'dataset'`) are never
  overwritten.
- **What the English source is:** the `free-exercise-db` entries have steps but no description;
  the `wger` entries have a description but no steps. A translation exists only where the English
  has that kind of text.

## Licences - read before reusing these files

The translations are **derivative works** of the English source texts:

- Texts derived from **free-exercise-db** (<https://github.com/yuhonas/free-exercise-db>) are
  derived from public-domain material (Unlicense). No conditions.
- Texts derived from **wger** (<https://wger.de>) are derived from material licensed
  **CC-BY-SA 4.0** (<https://creativecommons.org/licenses/by-sa/4.0/>). The translations of the
  wger texts are adaptations under that licence: they must keep the **attribution** to wger and
  are shared under **CC-BY-SA 4.0** as well. The attribution the app already serves, publicly and
  without a login, at `GET /api/v1/sources` (see the `/sources` route in
  `src/exercises/routes.js`), covers these translations too and must stay visible as long as they
  are served. The `wger` entries in these files are marked by their top-level key.

Anyone who copies the `wger` part of these files elsewhere takes on the same obligations.

## Re-importing

The importer is idempotent and only ever writes where no row exists or the row is already
`origin = 'machine'`. A `human` or `dataset` row is never touched. See the header of the script.
