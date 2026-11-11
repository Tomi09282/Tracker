# F4 — the integration tools

Eight scripts in `frontend/scripts/`, none of them in the `build` chain, no npm dependency, no network.
Run them with `node scripts/<name>.mjs` from `frontend/` (any cwd inside the worktree works: each tool
finds its tree from its own location). The specification is `PLAN.md` 2.1, 2.3, 4.4, 4.5, 6.2 and 8;
this page is how the tools are used and what they read.

| Tool | Who runs it | When |
|---|---|---|
| `pulse-owns-check` | anyone; the integrator at every merge (inside `pulse-merge-check`) | after any edit of `work-packages.json` |
| `pulse-sync <id>` | the agent, in its slot | on start, on resume, after the integrator answered a request |
| `pulse-i18n check / apply / revert` | the agent (`check`); `pulse-sync` (`apply` in the slot); the integrator (`apply --merge`) | whenever `i18n.patch.json` changes |
| `pulse-variants check / apply / revert` | the same three | whenever `variants.json` changes |
| `pulse-fixture-check <id>` | the agent; the integrator (inside `pulse-merge-check`) | whenever `states.json` gains a fixture |
| `pulse-ledger <id>` | the agent; a reviewer (`--ref`) | while rewriting a page; its lines go into `handoff.json` |
| `pulse-merge-check <id>` | the integrator, integration worktree | 6.2 step 1, and again with `--squashed` before the commit |
| `pulse-progress sync / claim / mark / snapshot / report` | the integrator (writers); anyone (`report`) | every loop tick; `snapshot` only inside an integration commit |

Exit codes are the same everywhere: `0` fine, `1` refused (the reason is printed), `2` usage, `3` blocked —
a rule could not be evaluated because a gate of this tree does not export its scan yet.

## Ids

Every tool takes a package id (`S-home`, `F9`), a lane stage (`F2:b`, also written `F2b` — a branch name
cannot hold a colon) or a fix round (`S-home-fix1`). All three have the ownership of their package.
The branch is `pulse/<id as written>`; a staged lane may keep one hand-in folder per stage
(`pkg/F2/b/`) — the stage folder is read first, then `pkg/<package>/`. `pulse-i18n`, `pulse-variants`
with no id read it from the current branch name.

## The integrator's merge, step by step (PLAN.md 6.2)

```
node scripts/pulse-merge-check.mjs <id>                 # 1  refuses, or says "may merge" / REQUIRES verify:gates
git merge --squash pulse/<id>                           # 2
node scripts/pulse-i18n.mjs apply <id> --merge          # 3  the SAME file the slot applied; grows copy-to-approve.md
node scripts/pulse-variants.mjs apply <id> --merge      #    and deviations.md (copyQuestions)
git cat-file blob pulse/<id>:docs/pipeline/pulse/pkg/<id>/shared.patch | git apply --3way -   # lanes only
npm run build                                           # 4
…captures, sweep, verify:gates…                         # 5-7
node scripts/pulse-merge-check.mjs <id> --squashed      #    only when step 1 said REQUIRES verify:gates
node scripts/pulse-progress.mjs mark <id> merged --commit <sha>
node scripts/pulse-progress.mjs snapshot                # 8  then commit, then fast-forward pulse-redesign
```

`apply --merge` records nothing for `revert`: at a merge the commit is the record and a red step is undone
with `git reset --hard HEAD`. Apply a `shared.patch` from the BLOB as above — a working copy of a `.patch`
file is CRLF on this machine unless a `.gitattributes` rule (`*.patch -text`) sits beside it, and
`git apply` refuses a CRLF patch.

## The agent's loop in a slot (PLAN.md 6.1)

```
node scripts/pulse-sync.mjs <id>            # merge pulse-redesign; re-apply the COMMITTED hand-in files
node scripts/pulse-i18n.mjs check           # after committing a changed i18n.patch.json
node scripts/pulse-variants.mjs check
node scripts/pulse-fixture-check.mjs <id>
node scripts/pulse-ledger.mjs <id>          # what the rewrite took out so far
node scripts/pulse-merge-check.mjs <id> --preflight     # optional: the integrator's check, minus the clean tree
```

The tools read a hand-in file from the branch HEAD — "pending" means committed (4.4 rule e). Commit the
hand-in FILE; never commit what `pulse-sync` applied (the bundles, `catalog.ts`, `scripts/data/*.json`,
the targets of `shared.patch`). `pulse-sync` undoes those with `git restore --source=HEAD` before it
merges; that is the one sanctioned restore of paths a package does not own, and only the tool does it.

## What depends on another lane

| Needs | From | Until it is in the tree |
|---|---|---|
| `scanKeyConsumers({ root })` exported by `check-i18n.mjs` | F2:b | `pulse-i18n` stops with exit 3 on any patch that touches a key |
| `scanElementReads({ root })` exported by `check-element-roster.mjs` | F2:b | `pulse-variants` stops with exit 3 on any delta |
| `verify-gates.mjs --list-anchors` and `--fresh` | F2:b | the anchors check is printed as `PENDING`; `anchoredBy` is used as the anchored set |
| a pure per-file counter exported by `check-pulse.mjs` — `countRules(source, relPath) -> { ruleId: n }` (`countFile` / `countSource` are accepted names) | F2:c | the ratchet leg of `pulse-merge-check` is `PENDING`; the budget FILE is compared regardless. If `check-pulse.mjs` exists without such an export the merge check REFUSES — it must import the counter, not repeat it (R31) |
| the recording store `.pulse/rec/` and fixtures in `states.json` | F3 | `pulse-fixture-check` fails closed: fixtures with nothing to hold them against are refused |

The tools never re-implement a gate's rule (R31). Whether a patched set of bundles or a patched catalogue is
valid is decided by RUNNING `check-i18n` / `check-element-roster` on a scratch checkout of the branch with
the hand-in applied; who reads a key or an element is asked of the gate's own scan, in a child process.

## Shapes the tools read

**`i18n.patch.json`** — exactly PLAN.md 4.4 item 2. Unknown fields are refused (a typo like `"sets"` would
otherwise be an empty patch). `set[].after` must name a sibling of the new key. A new key is appended to
its namespace object; a key whose family is flat at the top level (`achievement.*`) stays flat and joins
its family. A path segment that is a bare number is refused for a nested key (JavaScript would move it).

**`variants.json`** — `[ { "element": "E21", "live": false, "reason": "…" } ]`; the element must be one of
the unit's `variantElements` in `work-packages.json`.

**`shared.patch`** (lanes only) — `git diff` output; it may only MODIFY existing files, none of them the
lane's own, frozen or under `backend/`.

**A recording** (read by `pulse-fixture-check`, written by the capture tool): any JSON file under
`.pulse/rec/<account>/` that is, or lists (`[…]` or `{ "entries": […] }`), entries of the form

```json
{ "method": "GET", "path": "/api/v1/my-plans/today", "status": 200, "body": { "…": "…" } }
```

`url` may stand for `path`, `json` for `body`, and `bodyFile` may name a file beside the entry. A body
that is not JSON (an image) is skipped. Two calls are the same endpoint when method and path agree after
ids are folded (`/clients/17` and `/clients/99` -> `/clients/:id`; the query is ignored).

**A fixture** — an entry under a key named `fixture`, `fixtures` or `stubs`, anywhere in `states.json`,
`pulse-frames.json` or a file under `scripts/fixtures/`:

```json
{ "method": "GET", "path": "/api/v1/my-plans/today",
  "edits": [ { "pointer": "/session/status", "value": "planned" },
             { "pointer": "/session/note", "remove": true } ] }
```

The map form `{ "GET /api/v1/my-plans/today": [ …edits ] }` is read too. An edit is refused for a key, a
type or an enum value no recording of that endpoint has; a place counts as an enum when every recorded
value there is an identifier-like word (`planned`, `in_progress`) — if such a place is really free text,
record a response that carries another value. A key that begins with a digit (a date, an id) is data, not
schema: all such siblings share one shape. A mutation outcome or a stub has no recording to edit:
`{ "method": "POST", "path": "…", "status": 409, "body": { "error": "…", "code": "…" } }` — its body must be
empty or, for a status of 400 and above, stay inside the API's error envelope.

**`budget.json`** — compared as numbers only, whatever its layout: a numeric leaf that is higher on the
branch than at the merge base, or new and above zero, is a raised budget.

**A status file** (`.pulse/status/<id>.json`, folded by `pulse-progress sync`) — `status`, `step` or
`lastStep`, `frames` (`{ "<frame>": "<verdict>" }`; a name that is not a frame of the package becomes an
extra state), `extraStates`, `budgetNow`, `blockedOn`, `head`, `done`, `next`, `updated`. `done` and
`partial` are folded as `handoff` and `in_progress`; an agent's file never moves an entry out of
`integrating`, `merged`, `in_review` or `accepted`. A file whose id is not one package, stage or fix round
is listed under `statusFilesNotFolded`, not guessed at.

## The self-test

```
node docs/pipeline/pulse/pkg/F4/selftest.mjs                     # all eight tools
node docs/pipeline/pulse/pkg/F4/selftest.mjs --only i18n,sync
node docs/pipeline/pulse/pkg/F4/selftest.mjs --with pulse/F2b    # merge another lane into the clone first:
                                                                 # the cases then run on its REAL gate exports
```

It clones this repository into the OS temp dir, copies the working copies of the tools over the clone and
plants branches, hand-in files and defects there; the real tree, the real `.pulse/` and the running
backend are never touched. Where a gate of the tree under test does not export its scan yet, the test
first proves that the tools stop with exit 3, then plants a test double of the export in the clone so the
remaining rules can be exercised. The last line says which of the two it ran on.

## Known limits

- The three bundles do not have identical key order today: `common.delete` / `common.add` are swapped in
  `hu.json` against `en.json` and `de.json`. `pulse-i18n` inserts a key at the same place in all three and
  refuses a patch that would ADD a divergence; it does not repair the old one.
- `pulse-ledger` reads source with regular expressions. It is a list of questions for the hand-off, not a
  proof; the proof of "no behaviour lost" is the control inventory of the capture tool.
- `pulse-fixture-check` learns the shape of an endpoint from the recordings alone. A field the freeze never
  recorded cannot be set by a fixture until a response that carries it is recorded
  (`pulse-shot --record --only-missing`).
