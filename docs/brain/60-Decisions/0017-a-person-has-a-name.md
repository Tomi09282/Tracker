---
type: adr
title: ADR-0017 A person has a name, and the e-mail address is not it
status: accepted
phase: 9
date: 2026-08-24
migration: 029_display_name.sql (user_version 29)
tags: [decision, adr, schema, privacy, coaching, phase-9]
---

# ADR-0017 — A person has a name, and the e-mail address is not it

**Context.** The v4 redesign work reached the coach screens and stopped. The client detail page's
`<h1>` read:

```
demo.farkas.nora@tracker.local
```

Not a styling gap. The `users` table had **no name column of any kind**. The only `display_name` in
the entire schema was on `marketplace_profiles` (021), which exists so a coach can list themselves
publicly — so a coach had a name and a client did not. Six frontend files therefore reached for the
one human-looking string available and printed the address: the client roster, the client detail
header, the archive confirmation, the plan assignment list, the plan list rows, and the chat
conversation header. The monogram took its two letters from it as well, which is why every demo
client's avatar read **`DE`**.

No amount of design work fixes a screen whose content is wrong.

## The decision

Add `users.display_name TEXT`, nullable, bounded 2..120 trimmed — bounds copied verbatim from
`marketplace_profiles.display_name` so the two name fields in this database cannot disagree about
what a name is. Route every on-screen person label through one function, `personLabel`, in
`frontend/src/lib/person.ts`.

## Why this is not cosmetic

Three problems, and only the first one is about looks.

**1. It contradicts the design.** Every approved mockup shows a name.

**2. It is a privacy leak.** The coach dashboard renders one row per client and each row carried a
full, working, deliverable e-mail address. A coach with forty clients had forty of them on one
screen — readable over a shoulder, captured whole in a single screenshot. Nothing about coaching
requires it; the coach needs to know *which* client, and there is an id for that. Measured after the
change: **zero addresses on `/coach`**, where there had been one per row.

The plan list was worse in a quieter way. Its comment recorded that the address had been *demoted*
to `sr-only` because "four wrapping near-identical strings were four rows of noise" — which fixed
the visual problem and kept the privacy one, reading each client's full address aloud to anybody
using a screen reader. A name is short, so it comes back visible.

**3. An address is not stable.** Change it and every screen silently renames the person. Deriving
identity from a credential makes the credential's lifecycle the identity's lifecycle.

## Why nullable, and why not backfilled from the address

The tempting move is `NOT NULL DEFAULT ''` with a backfill from the local part, so no code has to
handle the empty case. It is wrong twice over:

- Copying the address in bakes **today's fallback into the data**. Afterwards no query can tell
  "this person chose to be called nfarkas92" from "nobody has asked them yet", and the prompt to set
  a real name can never be shown to the right people.
- It undoes reason 2 in the same statement that enables it — the address would still be on screen,
  laundered through a different column.

So `NULL` means exactly one thing: **not set yet**. It is legitimate and possibly permanent — a user
is never forced to name themselves — and the display layer owns the fallback, where it can change
without a migration.

**The fallback is the local part, never the address.** `demo.lukacs.adam` identifies without
delivering. Where the address itself is the subject — the account block in Settings, the admin user
search, the credential hand-off for a pregenerated account — it is still shown in full, under a
label that says so. That is a field, not a name.

## What the seed proves

The two `pregenerated` demo clients are deliberately left **nameless**. A coach-created account whose
owner has never signed in *cannot* have chosen a name, so it is a state that really exists, and
leaving it in the fixtures is what makes every list, header and monogram survive a NULL without
waiting for a real user to find out. Verified on screen: they render `demo.lukacs.adam` and
`demo.nemeth.zsofia`, with the domain gone.

## What this uncovered

**Six copies of "initials from a label".** `ChatPanel`, `ComposePage`, `ProfileEditorPage`,
`PublicChrome`, `PlanListPage` and `Monogram` had each grown their own, and they had already drifted
into different answers for the same input — `Madonna` was `MA` in the chat and `M` everywhere else,
an empty field was `·` in one and `""` in four, and only one of the six was safe against a name
containing an astral character (`name[0]` returns half of a surrogate pair). Collapsed to one.

**A third blind side in `check-i18n`.** The settings screen printed the literal string
`admin.role.coach` in its role chip — the namespace is `adminUsers`, not `admin` — with the gate
green. The gate's reverse check matches `t('literal')` only, and these keys sat in a lookup table
passed by variable:

```ts
const ROLE_LABEL = { coach: 'admin.role.coach', ... };
{t(ROLE_LABEL[user.role])}
```

The gate now also flags any string literal that is *shaped* like a key and whose first segment is a
namespace the bundle actually has. Proven load-bearing by re-planting the defect: three problems
reported, exit code 1, and 0 once fixed.

**The GDPR export checks tables, not columns.** `check-gdpr` stayed green through a new column of
personal data landing on an already-exported table. `display_name` was added to the `account` export
by hand; the explicit column list in `db/gdpr.js` is the only thing watching that boundary.

## Consequences

- One migration (029), one new endpoint (`PATCH /api/v1/auth/me`), one new i18n key group.
- `display_name` must be read through `personLabel`, never directly — the fallback is a decision
  about privacy, not a `??` for each call site to make on its own.
- The name is deliberately **never logged**. It is the one field on `users` a person chose for
  themselves, and `logs/server.log` is read by people who have no business knowing it.
- Admin screens keep the address on purpose. An admin searching users by e-mail is doing their job.

## What the pre-commit review caught, after all of the above was "done"

Five findings survived an adversarial pass. Three of them were in the work above and are fixed here;
the value of writing them down is that each was invisible to every gate that was already green.

**The bounds counted different units.** `z.string().min(2)` counts UTF-16 code units and SQLite's
`length()` counts characters, so `"🎉"` — two units, one character — passed validation and was then
refused by 029's CHECK. The user got `this change is not allowed by the data model` and the log got
`constraint refused a write`. The route's own comment already said *"if the two ever disagree, 029
wins and this is the bug"*, which turned out to be describing a live defect rather than a
hypothetical. All three statements of the rule now count code points, and `lib/person.ts` names the
other two so the next person can find them.

**Control characters were accepted.** A name containing a newline breaks every single-line list it
is rendered into; one beginning with NUL measures 0 to SQLite, which stops counting there; and the
bidi overrides (U+202A–U+202E, U+2066–U+2069) re-order the text *around* them, so a name could
rewrite how the rest of a coach's roster row reads. All rejected.

**The sort did the opposite of what its comment claimed.** SQLite compares text byte by byte, and
there is no API on `better-sqlite3` for a locale-aware collation, so `ORDER BY COALESCE(display_name,
email)` put every lowercase e-mail fallback after every capitalised name and every accented initial
after all of ASCII. Measured: `Balogh, Molnár, Papp, Zoltán, demo.lukacs.adam, nfarkas92, Ács Ádor`
— the unnamed accounts herded into a block at the bottom, which is exactly what the comment said
COALESCE prevented. The roster's order is now computed with `Intl.Collator` in `CoachDashboard.tsx`,
which is the one place that knows the reader's language; the SQL clause is documented as a stable
default and nothing more.

**A gate that scanned nothing.** The new `check-i18n` rule reached the file with its backslashes
doubled, so it matched a sequence no source contains: it ran, found nothing, and printed OK. Caught
by re-planting the defect it exists to catch and watching it pass. Rewritten without a regex. Its
first live run then flagged a *comment* discussing `common.on`, so it now reads code only — and its
first honest run found nothing new, which is the answer that took the longest to earn.

## What is deliberately still true

The review also surfaced addresses this change did NOT remove. They are listed here rather than
quietly left, because the claim at the top of this note would otherwise be wider than the work:

- **`progress_access_log.viewer_email_snapshot` stays a full address in the database.** An audit
  trail of who read someone's health data has to survive that person renaming themselves or being
  deleted, so it cannot be a join. The *screen* now shows the label, not the address.
- **`GET /nutrition-plans` still sends `client_email`.** Nothing renders it. It is scoped to the
  coach's own plans about their own clients, so it is not a new exposure — but it is an address on
  the wire with no consumer, and it should either be rendered through `personLabel` or dropped.
- **Chat notification titles are still built from the local part** in `db/worker.js`. That happens
  to match the fallback this note chose, so it is consistent rather than wrong, but it derives the
  label in a second place instead of reading `display_name`.

## Verification

`PATCH /api/v1/auth/me` probed against the running server, eleven boundary cases, all correct:
1 character → 400, `{}` → 400, 121 characters → 400, a single emoji → **400 from zod** (it used to
be an opaque refusal from the database), two emoji → 200, a newline → 400, a right-to-left override
→ 400, a forged `role: "admin"` alongside the name → **400 from `.strict()`**, missing CSRF header →
403, unauthenticated → 401, `null` → 200. The endpoint takes no id, so there is no other row it can
reach.

End to end in the browser: field pre-filled, save button appears only once something changed, and on
save the identity line, the monogram and the cached session all move together. Measured on `/coach`
afterwards: **zero e-mail addresses on screen**, monograms are real initials (`SG`, `FN`, `KD` —
they were all `DE`), and the two never-signed-in accounts sort into the alphabet rather than into a
block at the end.

See also [[0015-liquid-glass-replaces-the-packs]], [[0016-glass-rim-is-not-a-shadow]].
