---
type: decision
id: 0009
title: Hungarian exercise names are composed, not typed
status: accepted
date: 2026-08-05
tags: [decision, i18n, content]
---

# 0009 — Hungarian exercise names are composed, not typed

## Context

TRACKER is a Hungarian-first product whose exercise library had **1652 names and zero of them in
Hungarian**. wger, the dataset source, publishes no Hungarian at all — decision 0004 records the
run that mislabelled 582 French rows as Hungarian by guessing at a language id, which is why
nothing here guesses.

Two routes were available: hand-write a list of the exercises a coach actually programs, or find
the structure in the names. Measured on the real dataset, **300 distinct tokens fully cover 975 of
the 1652 names** — the library is overwhelmingly formulaic. A curated vocabulary therefore reaches
far more of it than any list a person would sit down and type, and keeps reaching further with
every word added.

## Decision

`backend/scripts/translate-exercises-hu.mjs`: a compositional translator with a hand-curated
vocabulary and Hungarian grammar written out as rules.

The grammar is the point. English puts equipment first and the movement last; Hungarian puts
modifiers first, compounds the body part ONTO the movement, and puts equipment last in the
instrumental case:

    "Barbell Shoulder Press"  →  [váll+nyomás] [rúddal]  →  "Vállnyomás rúddal"

A token-by-token substitution gives "rúd váll nyomás", which is why a dictionary alone is not
enough.

Specific rules that each came from a wrong output, not from theory:

- **Instrumental forms are STORED, not computed.** Hungarian's `-val/-vel` assimilates to the
  preceding consonant (rúd → rúddal, kábel → kábellel) and harmonises with the word's vowels. That
  is a real algorithm with real exceptions; the input set is nineteen words. A lookup cannot be
  wrong, an algorithm applied to "kettlebell" very much can.
- **A body part is not prepended when the movement noun already contains it.** "has" + "hasprés"
  composed to "hashasprés" — grammatical, and something no one has ever said.
- **An unqualified "curl" means the biceps.** Left as the bare "hajlítás" it reads as "a bend".
- **Multi-word phrases are glued before tokenising.** "Bent Over Barbell Row" resolved `bent` and
  `over` separately and produced "Dőlt átemelt evezés" — two unrelated adjectives for one idea.
- **Plurals resolve by rule, not by listing both forms.** After the first vocabulary pass the top
  blockers were `dumbbells`, `push-ups`, `swings`, `presses` — all plurals of words already
  present. One rule, `-es` before `-s`, covers them and every future one.
- **An override table for names composition gets idiomatically wrong.** "Bench Press" composed is
  "pad nyomás"; the Hungarian is "fekvenyomás", one word and not derived from "bench" at all.

## The rule that keeps it honest

**A name is translated only if EVERY token in it is known.** One unrecognised word and the whole
name is skipped, falls back to English, and is flagged `translated: false`. A half-understood name
rendered confidently is worse than an English one the reader can see is a fallback — the same
principle the taxonomy fallback chain follows.

## The script reports its own next task

It counts the unknown tokens across every skipped name and ranks them by frequency, using the same
lookup the composer uses so an already-resolvable plural is not reported as blocking. Adding
vocabulary by intuition is guesswork: the single biggest blocker turned out to be the **bare
hyphen** in wger's "Barbell Bench Press - Medium Grip" style, 48 occurrences, which no one would
have thought to add.

Coverage went 30% → 43% → 46% → **52%** across three data-driven passes. The remaining tail blocks
three to five names per word, which is where adding vocabulary stops paying.

## It owns its output completely

Caught by two counts disagreeing — 861 composed, 867 in the table. Six rows were stranded when
`over` was REMOVED from the vocabulary, and they kept their old wrong Hungarian with nothing to
reveal it. The script now withdraws any machine row it no longer composes. Rows a human has
reviewed (`origin <> 'machine'`) are never touched.

Every row is written `origin = 'machine'` even though a person chose every word, because no native
speaker has reviewed the OUTPUT. That flag is what makes a later review possible without guessing.

## Consequences

- **861 Hungarian exercise names**, making Hungarian the second-largest language in the library
  after English and ahead of Spanish (601) and German (584).
- A Hungarian coach can search "fekvenyomás" or "guggolás" and find the exercise. That is the
  product value; the rest is mechanism.
- It exposed a separate bug worth its own line: the list SORTED on the canonical English name
  while DISPLAYING the resolved one, so "Fekvenyomás" sat under B. Fixed by sharing one
  `RESOLVED_NAME` expression between the projection, the ORDER BY and the keyset cursor — all
  three must agree or pagination skips rows. Verified: "Fekvenyomás" is now at position 444 in
  Hungarian while "Bench Press" is at 137 in English, and four pages of cursor paging return 96
  rows with zero duplicates in both languages.

Related: [[0003-exercise-translations]] · [[0008-taxonomy-translations]]
