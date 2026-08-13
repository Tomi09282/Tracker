# Phase 7 regression sweep (T7.5.4)

**Run:** 48 agents — five attack lenses over the 17-commit diff, then one independent skeptic per
claim, told to default to *refuted*. **42 claimed · 35 survived · 7 refuted · 0 fatal in the
product.**

The two findings that mattered were both in gates written the same day, and both were the failure
those gates exist to prevent.

---

## Fixed in this pass

### `check-route-tx` inspected zero of nine call sites and printed OK — FATAL

It matched only `const [x] = await db.writeTx([` — the destructured form — reasoning that a route
ignoring the result has nothing to branch on. The reasoning is sound; the regex made the gate's
subject a **spelling** rather than a call.

Measured: nine routes call `db.writeTx`, the gate inspected none, and it printed
`0 inspected db.writeTx result(s)` followed by `OK`. That number went past twice.

> A clean result is a statement about **coverage** before it is a statement about the subject.

Now matches every call site however the result is captured, and **checks its own coverage** against
a crude independent grep: zero inspected while `db.writeTx` exists in `src/` is a build failure, and
any shortfall is printed rather than hidden. No live defect behind it — verified before claiming so.

### An alias hid three admin routes from `check-admin-audit` — SEVERE

`const requireAdmin = requireRole('admin')` in `public/moderation.js`. Three routes use it, and all
three sat outside every rule in that gate. It reported *10 admin routes* over a codebase with 15.

Same shape as the four routes the parser could not see. With aliases resolved it immediately found
the real defect: **`GET /admin/marketplace/reports` authorised from the JWT alone** — a revoked admin
could read the moderation queue for up to fifteen minutes. Its two sibling writes were fine; they
re-check under the write lock.

### `assertAdmin` had three copies that had already drifted — SEVERE

Two private functions plus one inlined. The abuse-signal log line was added to one copy that morning
and reached neither of the others, so two of three refusals were still silent. A fourth copy was
about to be written; it got [[assert-admin]] instead. 15 admin routes, 10 via `assertAdmin`, 5 under
the write lock.

### Opening any existing post fired an unrequested PUT — SEVERE

`savedSnapshot` starts `null`. The editor fills with the server's text, the hook sees a difference
between screen and last-saved — because it has never saved anything — and 1.5s later PUTs a post
nobody touched. One line in the editor seeds the snapshot from the loaded post.

`verify-autosave` had eight assertions about RACE-7 and **none about the moment before it**. It now
carries the case *and a control* proving the assertion is not vacuous: without the seed, the same
untouched document does save.

### The autosave probe had already drifted from the hook — SEVERE

Its transcription called `save(payload)`; the shipped hook calls `save()`. The central assertion was
exercising a signature that does not ship — rule 4 biting in the file that warns about rule 4.

---

## Open, ranked

| Severity | Where | What |
|---|---|---|
| ~~severe~~ **FIXED** | `worker.js` erasure | the erasure audit row stores the erased person's IP, and nothing can remove it |
| ~~severe~~ **FIXED** | `rekey.mjs:67` | the "stop the server first" precondition passes precisely when the danger is present |
| ~~severe~~ **FIXED** | `rekey.mjs:90` | the backup precondition checks an mtime — a zero-byte file passes |
| ~~severe~~ **FIXED** | `gdpr.js:61` | the export ships plan headers and no plan content; `check-gdpr` structurally cannot see the omission |
| ~~severe~~ **FIXED** | `deleteMyAccountTx` | erasure leaves the subject's `private` and `pending_review` exercises behind |
| ~~severe~~ **FIXED** | `check-safe-area:107` | the edge rule cannot cross a quote, so the bottom sheet is never examined |
| moderate ×12 | gates and projections | vacuous assertions, unreachable exemptions, an admin id in the export |
| minor ×10 | comments and shapes | docblocks asserting things their own bodies do not do |

---

## What the refuted claims say

Seven of 42 were wrong, and the pattern is worth keeping: every one misread a guard that lives
**inside a transaction** as absent, because it is not in the route. That is the house style working
as intended and reading as a gap — which means the route-level comment pointing at the transaction
is load-bearing documentation, not decoration.

## The rule this sweep re-earned

Three gates shipped this phase had a blind spot, and in each case the gate **printed the number that
would have shown it**: `0 inspected`, `10 admin routes`, `16 files use an inset`. A coverage figure
next to an OK is not a reassurance — it is the first thing to read.
