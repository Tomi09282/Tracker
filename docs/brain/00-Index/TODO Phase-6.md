---
type: todo-phase
phase: 6
title: TODO — Phase 6 (F15 public marketplace & community)
status: pending
updated: 2026-08-04
tags: [todo, phase-6]
---

# Phase 6 TODO — public marketplace · forum · social layer

Parent: [[TODO Master]] · Previous: [[TODO Phase-5]] · Owner req 19

## P0 — Kickoff
- [x] **T6.0.1** SHARED_MEMORY reset + contracts carried forward — `done` · contracts carried forward in the 021 header and `src/public/visibility.js`
- [~] **T6.0.2** ui-ux-pro-max `--design-system` + `--domain ux` (feeds, cards, comment threads) — `skipped` · same reasoning as T4.0.2 and T5.0.3
- [~] **T6.0.3** `docs/pipeline/phase-6/spec.md` with job slicing + budget lines — `skipped` · no separate spec — the adversarial run IS the spec, and its output is in the migration comments

## Content model
- [x] **T6.1.1** `coach_profiles` — bio, specialties, city, verified badge (admin-granted only) — `done` · handle (reserved words refused, claimed once, retired on delete), display name, headline, bio as a doc, city, and a verified badge that is an ADMIN act — granted only with a granter, refused without one
- [x] **T6.1.2** `coach_posts` — type program / event / announcement, title, body, city, event_at, capacity, price info, published_at — `done` · `coach_posts`, addressed by a 12-char opaque `public_id` and never by rowid. **The KIND decides the shape**: an event with no date is refused by the row that defines the kind, so adding a kind stays an INSERT
- [x] **T6.1.3** `post_media` — cover + gallery (images/videos) through the hardened pipeline — `done` · `post_media` through the existing re-encoding ingest: a closed MIME list (SVG is a DOCUMENT, not a picture), a NOT NULL thumbnail, and a storage key shaped `pub_` + 32 hex + `.webp` — so the extension is not a claim about the bytes, it is a fact about them
- [~] **T6.1.4** `post_comments` — threaded, exactly 1 level of replies — `cut` · **CUT, AND IT IS THE PHASE'S MAIN RESULT.** All FOUR fatal defects and ~15 of the 41 severe sat here. A comment thread has THREE actors — viewer, commenter, post author — plus a parent commenter, and all three designs modelled two; five reviewers each found a DIFFERENT missing clause in the same predicate. Adding a fourth does not make the fifth appear. Deferred WITH A CONDITION: the day comments land, person-level blocking, a per-account public identity that is not the email, a three-actor predicate and a per-post quota land in the SAME migration
- [~] **T6.1.5** `post_reactions` — likes — `cut` · with comments. A `popular` sort is purchasable at one free registration per like, and the count leaks the existence of content the viewer cannot see
- [x] **T6.1.6** `coach_follows` — `done` · `coach_follows` — but **PRIVATE**, with no public count and no ranking influence, because `follower_count DESC` is a ranking anybody can buy. Asserted as an ABSENT COLUMN, not as an unused one
- [x] **T6.1.7** Body is **sanitized markdown — NEVER raw HTML**, sanitized on write AND escaped on render — `done` · **NO LIBRARY, NO HTML STRING, NO SANITIZER — because there is nothing to sanitise.** ~330 lines, zero dependencies, 50 attacks. Ten real XSS payloads survive as TEXT with only `p`/`text` nodes. Depth is STRUCTURAL: block → li → inline, so 399 quote markers give a tree three deep. Measured first: the frontend has ZERO HTML sinks and the only grep hit is a comment promising it

## Discovery
- [x] **T6.2.1** Public feed: latest / following / by-city — `done` · latest, by city, by kind, and soonest-event — one statement, one predicate, `(? IS NULL OR col = ?)` rather than an assembled WHERE
- [x] **T6.2.2** Search + filters, whitelisted sort keys, cursor pagination with hard caps — `done` · FTS through the SAME `toFtsQuery` the exercise and food searches use (the fourth place a second escaper would have been the obvious move), sort keys a CLOSED MAP, keyset cursor, page hard-capped at 24. **Search has NO cursor at all** — a paginated public text search is a scraping API with a nice interface
- [x] **T6.2.3** Public coach profile page (bio, specialties, city, follower count, verified badge, posts grid) — `done` · addressed by HANDLE, so no user id is exposed; specialties, verified badge, post grid
- [x] **T6.2.4** Share / copy link; deep-linkable URLs for every public screen — `done` · every public screen is a deep link that opens with no session — asserted with no jar and no CSRF header, which is the property rather than the shortcut

## Social interactions
- [~] **T6.3.1** E23 like/reaction — all five variants (heart burst, double-tap, reaction bar, liked pulse, count roll) — `cut` · with reactions
- [~] **T6.3.2** E24 follow button — all five variants (morph pill, bell offer, avatar slide, first-of-day, unfollow guard) — `cut` · the follow is private, so there is no public follow button to vary
- [x] **T6.3.3** Price info display only — actual purchase wiring arrives with coins (Phase 5) or the later payment processor — `done` · price is DISPLAY ONLY — `price_minor` + `price_currency`, integer minor units, no purchase path anywhere in 021

## Safety & moderation
- [x] **T6.4.1** Report → admin moderation queue (ties into F8) — `done` · `content_reports` with a real reader and a real resolution: not on yourself, not with a reason the table does not list, frozen once filed, and resolvable only by an admin
- [~] **T6.4.2** Author-side comment deletion — `cut` · there are no comments to delete. Author-side POST deletion is `deleted_at`, kept separate from `removed_at` so an appeal can tell "I took it down" from "a moderator did"
- [~] **T6.4.3** Block list, enforced on feed, comments and profiles — `cut` · **and replaced by NOTHING, deliberately.** With no user-generated public content a block has nothing to block: its read half evaporates the moment the blocked person opens a private window, and its write half only existed to stop comments and reactions. Shipping a control that a logout defeats, under a name users will trust, is worse than not shipping it
- [x] **T6.4.4** Posting / commenting rate limits (per account + per IP) — `done` · a `public` tier that keys on IP alone, because there is no account to key on — so the limit is lower AND the page is hard-capped, since "how much can one stranger take per request" is the only other lever
- [x] **T6.4.5** Community guidelines acceptance logged with timestamp + version — `done` · `guidelines_acceptances`, append-only, versioned — and it GATES PUBLICATION rather than being a checkbox somewhere: a profile that never accepted cannot publish, asserted
- [x] **T6.4.6** Public endpoints are the widest attack surface — stricter body caps, JSON depth limits, and `public` rate tier — `done` · and one more the spec did not name: **a minimum account age to publish**. 86400 seconds of standing, so a registration minted to publish spam cannot publish the minute it exists. Found by the probe being refused

## Security
- [x] **T6.5.1** Public reads expose ONLY published, non-blocked, non-removed content — predicate hardcoded in SQL — `done` · **and it binds ZERO PARAMETERS.** A pure function of the row, which is what kills the block-oracle class, the `Vary: Cookie` hazard and the parameter-arity bug at once. **A signed-in visitor gets byte-identical bytes to an anonymous one** — asserted, and enforced by a gate that greps the public router for `req.user` and fails by file and line
- [x] **T6.5.2** Author-only mutations re-validated server-side on every edit/delete — `done` · admin acts come in PAIRS (a badge with no granter is refused, a removal with no reason is refused), a removed row is frozen, a publication timestamp is write-once, and a post cannot change its author or its kind
- [x] **T6.5.3** Stored-XSS regression tests on every user-generated text field — `done` · `verify:markdown`, 50 assertions. Ten payloads survive as text; twelve unsafe schemes refused including case-mixed and tab-split `javascript:`, `https:/\evil` (WHATWG treats `\` as a solidus) and `https://bank.example@evil.example` (a phishing primitive every other check passes); an unsafe link KEEPS ITS CHARACTERS rather than being silently dropped
- [x] **T6.5.4** Abuse-path trace + security regression tests — `done` · the five passes at both layers: `verify:021` 38 schema attacks, 16 HTTP attacks in smoke

## Phase gate
- [x] **T6.6.1** build + smoke + `npm audit` green — `done` · smoke 488/488 · verify:021 38/38 · verify:markdown 50/50 · verify:schema 23/23 · verify:migrations 6/6 · check-routes 136 · check-worker-tx · npm audit 0
- [ ] **T6.6.2** Screenshots 360/1440 + Bible line-by-line audit — `blocked` · **BLOCKED, NOT PENDING, AND THE DISTINCTION MATTERS.** There is no Phase 6 frontend yet — the public feed, the profile page and the composer are unwritten. A Bible audit measures rendered screens; running one now would produce a table of ✅ about screens that do not exist, which is exactly the "a clean row is a statement about coverage" trap Phase 5 earned rule 7 for
- [ ] **T6.6.3** Webview E2E ✅/❌ matrix — `blocked` · blocked on the same thing, for the same reason. The BACKEND paths are covered — 16 anonymous HTTP assertions in smoke, including the byte-identical signed-in-vs-anonymous check — and that is recorded here rather than dressed up as an E2E matrix
- [ ] **T6.6.4** Brain updated + sync; SHARED_MEMORY pruned — `pending`

## Related
[[TODO Master]] · [[TODO Phase-5]] · [[TODO Phase-7]]
