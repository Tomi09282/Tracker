# Coach tooling — spec

Author: Claude Opus 5 · Date: 2026-09-09 · Owner sign-off on the design: 2026-09-09

Not a numbered phase. Phases 4–9 are already allocated in [[TODO Master]]; this is a workstream that
cuts across the coach surface and the exercise library, opened on owner report.

Scope: **equipment editing after onboarding** · **filtering in the exercise picker** ·
**the plan builder's composition experience** · a **visual pass limited to the screens this touches**.

Decisions taken before writing: [[0012-opt-in-exercise-filtering]] ·
[[0013-coach-writes-client-equipment]].

---

## The three reports this answers

1. There is no visible place to set equipment after onboarding.
2. Building a plan, exercises cannot be narrowed by muscle group, equipment or name in combination.
3. Composing a plan should be a visual act, not a sequence of nested disclosures.

## What already exists and must not be rebuilt

Most of this is a surface problem. The machinery is in place and was built for exactly this.

- **The taxonomy and its junctions.** `muscle_groups` (20), `equipment` (16),
  `exercise_muscle_map` carrying `role` (primary/secondary), `exercise_equipment_map`,
  `onboarding_equipment`. Lookup tables rather than CHECK constraints, deliberately, so an admin can
  add kit without a migration. `taxonomy_translations` makes both sets multilingual.
- **The filters on `GET /exercises`.** `q` (FTS against the *translations* index, so a Hungarian
  query matches Hungarian text), `muscle`, `equipment`, `difficulty`, `type`, `mine`, `sort`,
  cursor pagination, and `for_client` — which returns `missing_equipment[]` and `conflicts[]` per
  row as one extra query over the page's ids, not a join into the list query.
- **The client's own write path.** `PATCH /onboarding` accepts `equipment: number[]`, validates the
  ids against the `equipment` table, and does the whole save in one transaction — the comment says
  why: *a half-saved profile — equipment written, limitations lost — is the thing to avoid*.
- **`MuscleMap`.** Takes `highlights: Record<slug, role>` and, when given `onSelect`/`selected`,
  is an accessible single-select control with `aria-pressed`. Already used as a filter writer in
  the library and as a read-only anatomical plate in the player.
- **Reordering.** `PUT /plans/:planId/blocks/order` and `/exercises/order` take a whole-list order.
- **The anti-IDOR pattern.** Object-level miss → 404, role gate → 403, the link as the authority.

## What is genuinely missing

| | |
|---|---|
| A door to the equipment editor | Route `/onboarding` is live and unguarded after completion; nothing links to it |
| Any coach write on client equipment | `GET /clients/:id/onboarding` exists; there is no `PATCH` |
| Filters in the picker | It sends `q` and `for_client` only |
| A filter surface in the library | The equipment strip was removed on purpose; the sheet that replaces it was never built |
| Server-side narrowing by availability | `missing_equipment` annotates; nothing filters on it |

---

## CT-1 — Backend

Four changes. No schema migration.

- **CT-1.1** `equipment` on `GET /exercises` becomes multi-valued. The existing single-slug
  `EXISTS (…)` predicate becomes an `IN (…)` over the ticked set. Cap the list; the taxonomy is 16
  rows and a request asking for 400 is not a real request.
- **CT-1.2** New `only_available=1`, valid **only** alongside `for_client`. Excludes rows with any
  missing equipment, using the same predicate that populates `missing_equipment`. Rejected with 400
  when `for_client` is absent — a filter that silently does nothing is the thing [[0012-opt-in-exercise-filtering]]
  refuses.
- **CT-1.3** New `hide_conflicts=1`, same rule, against `body_area_muscle_map`.
- **CT-1.4** New `PATCH /clients/:linkId/onboarding/equipment` per [[0013-coach-writes-client-equipment]]:
  `requireCoach`, link-keyed, a write limiter, and **one transaction writing three rows** — the
  equipment set, an `audit_log` row, a `notifications` row for the client.
- **CT-1.5** Extend `check-admin-audit` so its rule covers coach cross-user writes, not only
  `requireRole('admin')`. Without this, CT-1.4's audit line is a fact about today.

> [!warning] CT-1.2 and CT-1.3 must not be done in the browser
> The list is cursor-paginated. Filtering the returned page client-side turns a 20-row page into
> three rows while the cursor still says there is more — the pagination would be reporting on a set
> the user is no longer being shown.

## CT-2 — The shared `ExercisePicker`

One component, two callers: the library screen and the plan editor. Today they draw two different
lists from one endpoint.

- **CT-2.1** Extract the picker out of `PlanEditorPage.tsx` (926 lines) into its own module with the
  props it actually needs: `forClient?`, `onPick`, and the caller's filter defaults.
- **CT-2.2** The filter sheet behind a funnel badge — equipment (multi), difficulty, type — with the
  active-filter count on the badge. This is the open question recorded in `LibraryPage.tsx:73`,
  answered.
- **CT-2.3** Muscle stays on `MuscleMap` plus the chip row, unchanged. It is the app's signature
  control and it already writes a filter.
- **CT-2.4** In the coach context only, the two toggles at the foot of the sheet, **default off**.
- **CT-2.5** Reinstate the equipment filter in the library through the same sheet. It comes back
  without the second chip strip that got it removed.

## CT-3 — Equipment, editable

- **CT-3.1** A `Felszerelés` section in Settings — the seventh, beside account, coins, appearance,
  cues, language and admin. The onboarding chip field, `PATCH /onboarding`, no new endpoint.
- **CT-3.2** On the coach's client detail screen, an editable equipment card against CT-1.4, with
  the audit and the client notification behind it.
- **CT-3.3** [[settings]] and [[coach-client-detail]] updated. Screen specs are updated **in the
  phase that ships the screen**, never in advance — a spec describing an unbuilt screen is the
  defect this project keeps finding.

## CT-4 — The builder

- **CT-4.1** The picker opens as a half-height sheet **over** the plan rather than replacing the
  `+ Gyakorlat` button in place. While choosing, the coach can still see what is being built.
- **CT-4.2** The sheet stays open after an insert, so several movements go in without re-opening it.
  **No bulk endpoint.** `POST /plans/:id/exercises` takes one exercise and each insert gets its own
  undo; a batch behind a single undo is worse than four inserts with four undos.
- **CT-4.3** Drag-to-reorder as an **enhancement over** the up/down chevrons, never a replacement —
  see the warning in [[coach-plan-editor]]. The chevrons also come back on exercise rows on focus,
  which that spec already calls for and which is currently outstanding.
- **CT-4.4** **Volume heat map.** As a day fills, `MuscleMap` renders the day's muscle-group load
  through its existing `highlights` channel: the coach sees at a glance that the pressing day never
  touches the back. The component already colours by `role`; if the two levels prove too coarse for
  volume, adding a level is a change to one recipe, not a new component.

## CT-5 — Visual pass

Bounded to the screens this workstream touches: the plan editor, the picker and its sheet, and the
Settings equipment section. Driven from `frontend/PATTERN-GAP.md` — 56 of 73 patterns violated
app-wide — taking only the entries that cite these files.

The remaining backlog stays where it is. It is a project with its own spec, and folding it in here
would stall the coach features behind it.

---

## Edge cases the implementation has to answer

- **Template plans have no client.** [[coach-plan-editor]]: *no conflict or equipment chips at all*.
  The two toggles must be **absent**, not present-and-disabled, when `for_client` is absent.
- **Zero results from filters.** The empty state must say which filter emptied the list and offer to
  clear it. `PATTERN-GAP` already records error/no-results conflation on six list screens; this must
  not add a seventh.
- **A client with no equipment recorded.** `only_available=1` would return nothing. Treat an empty
  set as "unknown", not as "owns nothing", and say so where the toggle lives.
- **Offline.** The editor disables every mutation and has no queued-write store. Filters are reads
  and may stay live; the two toggles are reads too.
- **A coach edit racing a client edit.** Last write wins, and the notification tells the client.

## Gates this must pass

`check:routes` (no write without a limiter) · `check:route-tx` · `check:admin-audit` (extended by
CT-1.5) · `verify:schema` · `check:tokens` (no raw control outside `src/ui/`) · `check:elements` ·
`check:i18n`.

> [!important] Every new string needs hu, en and de
> `check:i18n` sits in the frontend `build` chain. A string added in Hungarian only does not fail at
> runtime — it fails the build.

## Out of scope, recorded so it is not re-litigated

- Location-based equipment profiles (gym / home / travel) — [[0013-coach-writes-client-equipment]].
- Coach writes to any profile field other than equipment — same ADR.
- Desktop layouts. The app is mobile-first and Capacitor-packaged; the owner ruled desktop out for
  this workstream, so the two-pane builder is not built.
- The freestyle-start gap: `POST /workouts/start` accepts a null `plan_day_id` and no UI reaches it,
  while `workout.noneBody` advertises it. Real, separate, and a client-side concern rather than a
  coach one.
- The plan-session title falling back to `workout.freestyle` on the home screen because seeded logs
  carry `title = NULL`. Also real, also separate.
