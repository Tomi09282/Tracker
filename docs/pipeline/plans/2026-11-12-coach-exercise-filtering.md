# Exercise Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the coach (and the library user) narrow the exercise list by muscle group, equipment, difficulty, type and name in combination, and — for a client's plan only — opt in to hiding what the client cannot do.

**Architecture:** `GET /exercises` already filters on `q`, `muscle`, `difficulty`, `type` and annotates rows for a client; this plan makes `equipment` multi-valued and adds two **server-side** switches, `only_available` and `hide_conflicts`, valid only with `for_client`. On the client, one filter sheet (equipment, difficulty, type, plus the two coach switches) behind a funnel button with a count badge is mounted in the two places that list exercises: the library screen and the plan editor's picker. Flagging stays the default; every filter is off until the coach turns it on (ADR-0012).

**Tech Stack:** Node/Express, better-sqlite3-multiple-ciphers in a Piscina worker pool, zod, React 19 + TypeScript + Tailwind (Pulse kit), react-i18next, TanStack Query.

This is **plan B of three** for the workstream in [`docs/pipeline/coach-tooling-spec.md`](../coach-tooling-spec.md). It covers CT-1.1, CT-1.2, CT-1.3, CT-2.2, CT-2.3, CT-2.4, CT-2.5 and the "zero results" and "unknown equipment" edge cases. Plan A (equipment editing) is on `master`; plan C (builder + visual pass) follows and builds on the picker this plan leaves behind.

Branch: `feat/coach-exercise-filtering` (cut from `master`). Decisions: [[0012-opt-in-exercise-filtering]], [[0013-coach-writes-client-equipment]].

## What changed since the spec was written (read this first)

The spec predates the Pulse redesign. Two of its premises moved:

- **CT-2.1 (extract the picker) is already done.** `frontend/src/features/plans/ExercisePicker.tsx` exists, extracted for DEV-093 (it draws a muscle map per result). It is an **in-place** picker (replaces `+ Gyakorlat`, not a sheet — that is plan C), shows at most **12** rows (`rows = (…).slice(0, 12)`), reads only the first page, and has **no filters at all**. This plan edits it; it does not re-extract it.
- **The library's equipment strip is still cut** (`LibraryPage.tsx` comment: "No `equipment` filter"). CT-2.5 reinstates it through the sheet, not as a second chip strip.

Consequence for this plan: removing the 12-row cap and adding a "show more" control is **in scope** (Task 4). A filter that can leave 30 matches while the picker shows 12 would be the same lie as client-side filtering of a page.

## Global Constraints

- **Every user-visible string exists in `hu`, `en` and `de`.** `npm run check:i18n` sits in the frontend `build` chain; a Hungarian-only string fails the build, not the runtime.
- **No raw interactive element outside `frontend/src/ui/`.** `npm run check:tokens` rejects it. Compose `Pressable`, `TextLink`, `Chip`/`Toggle`, `Switch`, `ListRow`.
- **The toggles filter on the server, never in the browser.** The list is cursor-paginated; filtering a returned page turns 20 rows into 3 while the cursor says there is more (ADR-0012, spec CT-1 warning).
- **`only_available` and `hide_conflicts` without `for_client` are `400`**, not silently ignored (a filter that does nothing is what ADR-0012 refuses). The toggles are **absent** from the UI — not disabled — when there is no client.
- **Default = unchanged.** With every filter off the response shape and rows are exactly what they are today; the plain listing carries no client data (an existing smoke check asserts this).
- **Ownership comes first.** A link id is guessable and `for_client` exposes injuries; the coach↔client link, checked in the SQL, is the access key. Object-level miss → `404`.
- **Statements stay static strings with bound parameters.** The new `IN (…)` list is built from `?` placeholders only; the slugs themselves are always bound.
- **An empty equipment set means "unknown", not "owns nothing".** `only_available` is a no-op for a client with no equipment on record, and the response says so (`for_client.equipment_known: false`).
- There is **no unit-test framework in this repo.** Backend verification is `npm run smoke` (hermetic: throwaway encrypted DB, fresh server) plus the `check:*` / `verify:*` gates; frontend verification is `npm run build` (i18n, tokens, tsc) plus a walk-through in the running app. Do not add vitest or jest.
- Files on disk in this tree have **CRLF** line endings. Single-line `Edit`s are fine; after any multi-line edit run `git diff --stat` and confirm the change is the size you expect (a collapsed line ending shows up as a whole-file diff).

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/exercises/routes.js` | **Modify** — `ListQuery`, link resolution up front, multi-valued `equipment`, the two switches, the `for_client` block in the response |
| `backend/scripts/smoke.js` | **Modify** — the filtering section, after the coach-equipment block |
| `frontend/src/features/library/useExercises.ts` | **Modify** — `ExerciseFilters`, the query string, the page type |
| `frontend/src/features/library/exerciseFilters.ts` | **Create** — `SheetFilters`, `NO_SHEET_FILTERS`, `sheetFilterCount` (pure) |
| `frontend/src/features/library/ExerciseFilterSheet.tsx` | **Create** — `FilterButton` (funnel + badge) and `ExerciseFilterSheet` |
| `frontend/src/features/library/LibraryPage.tsx` | **Modify** — mount the funnel and sheet (CT-2.5) |
| `frontend/src/features/plans/ExercisePicker.tsx` | **Modify** — muscle chips, funnel + sheet, all pages + "show more", honest empty state |
| `frontend/src/i18n/{hu,en,de}.json` | **Modify** — new `filters` block and three `plans.picker*` keys, all three |
| `docs/brain/55-Screens/coach-plan-editor.md`, `library.md` | **Modify** — in Task 5, the phase that ships the behaviour |
| `docs/brain/30-API/Endpoints.md` | **Regenerate** — `npm run brain:gen` (Task 5) |

---

### Task 1: The server-side filters (CT-1.1, CT-1.2, CT-1.3)

**Files:**
- Modify: `backend/src/exercises/routes.js`
- Test: `backend/scripts/smoke.js`

**Interfaces:**
- Consumes: `coach_clients`, `onboarding_equipment`, `onboarding_limitations`, `body_area_muscle_map`, `exercise_equipment_map`, `exercise_muscle_map`, `equipment`; `db.get` / `db.all`; the existing `VISIBLE` / `visibleParams`, `sendError`, `ERR`.
- Produces: `GET /api/v1/exercises` accepting `equipment=<slug>[,<slug>…]` (any-of, at most 16), `only_available=1`, `hide_conflicts=1` (both need `for_client`, else 400); when `for_client` is present the JSON gains a top-level `for_client: { equipment_known: boolean }`; module-private helpers `equipmentSlugsOf(raw)`, `clientOf(linkId, coachId)`; `annotateForClient(rows, clientId)` now takes the **resolved client user id**, not the link id.

- [ ] **Step 1: Write the failing smoke section**

In `backend/scripts/smoke.js`, find the comment `// Access must end with the link, not with the token.` (inside the coach section, right after the coach-equipment block, about line 1540). Insert the following block **immediately before** the `{` that opens that comment's block, so it runs while the link is still active. It uses `coachA`, `linkId`, `equipmentIds`, `seeded`, `stamp`, `Jar`, `call`, `check` that are already in scope there.

```js
  // --- filtering the picker on the server (coach-tooling plan B: CT-1.1 - CT-1.3) --------------------
  //
  // Four exercises with KNOWN properties, built here: the suite runs on a throwaway database, and a
  // check that relies on what the seeded dataset happens to contain is a check that can pass by
  // finding nothing. The client's set is pinned first, so "available" has one meaning.
  {
    const wanted = equipmentIds.slice(1, 3);
    await call(`/api/v1/clients/${linkId}/onboarding/equipment`, { method: 'PATCH', jar: coachA, body: { equipment: wanted } });

    const { json: tax } = await call('/api/v1/taxonomies?lang=en', { jar: coachA });
    const slugOf = (id) => tax?.equipment?.find((e) => e.id === id)?.slug;
    const ownSlug = slugOf(equipmentIds[1]); // in the client's set
    const missSlug = slugOf(equipmentIds[0]); // NOT in it (plan A pinned the sets disjoint)
    const make = async (name, extra = {}) =>
      (await call('/api/v1/exercises', { method: 'POST', jar: coachA, body: { name: `${name} ${stamp}`, ...extra } })).json?.id;
    const idHave = await make('Filter have', { equipment: [ownSlug] });
    const idMiss = await make('Filter miss', { equipment: [missSlug] });
    const idNone = await make('Filter none');
    const idKnee = await make('Filter knee', { muscles: [{ slug: 'quads', role: 'primary' }] });
    check('the four filter fixtures exist', [idHave, idMiss, idNone, idKnee].every(Number.isInteger), `${[idHave, idMiss, idNone, idKnee]}`);

    // Follow nextCursor to the end. Page size is a parameter so the pagination check can use 2.
    const walk = async (qs, limit = 24) => {
      const pages = [];
      let cursor = null;
      let status = 200;
      do {
        const { res, json } = await call(
          `/api/v1/exercises?${qs}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          { jar: coachA },
        );
        status = res.status;
        if (status !== 200) break;
        pages.push(json.exercises);
        cursor = json.nextCursor;
      } while (cursor && pages.length < 200);
      return { status, pages, rows: pages.flat() };
    };
    const has = (w, id) => w.rows.some((e) => e.id === id);
    const ids = (w) => w.rows.map((e) => e.id).sort((a, b) => a - b);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    // CT-1.1 — `equipment` is any-of over the ticked set.
    {
      const one = await walk(`mine=1&equipment=${ownSlug}`);
      check(
        'equipment=a returns what uses a, and neither the other kit nor the kit-less movement',
        has(one, idHave) && !has(one, idMiss) && !has(one, idNone),
        `${ids(one)}`,
      );
      const both = await walk(`mine=1&equipment=${ownSlug},${missSlug}`);
      check(
        'equipment=a,b is ANY-of: both, and still not the kit-less movement',
        has(both, idHave) && has(both, idMiss) && !has(both, idNone),
        `${ids(both)}`,
      );
      const { res: tooMany } = await call(
        `/api/v1/exercises?equipment=${Array.from({ length: 17 }, (_, i) => `k${i}`).join(',')}`,
        { jar: coachA },
      );
      check('a list longer than the taxonomy (17 slugs) is refused', tooMany.status === 400, `status ${tooMany.status}`);
    }

    // CT-1.2 / CT-1.3 — valid only alongside for_client.
    {
      const a = await call('/api/v1/exercises?only_available=1', { jar: coachA });
      const b = await call('/api/v1/exercises?hide_conflicts=1', { jar: coachA });
      const c = await call(`/api/v1/exercises?for_client=${linkId}&only_available=0`, { jar: coachA });
      check(
        'only_available / hide_conflicts without for_client are 400, not silently ignored; only "1" is a value',
        a.res.status === 400 && b.res.status === 400 && c.res.status === 400,
        `${a.res.status}/${b.res.status}/${c.res.status}`,
      );
    }

    // CT-1.2 — only_available is the SAME predicate that fills `missing_equipment`, proved by
    // agreement with the annotation over the whole catalogue rather than by a hand-picked row.
    const plain = await walk(`for_client=${linkId}`);
    {
      const avail = await walk(`for_client=${linkId}&only_available=1`);
      const expected = plain.rows.filter((e) => e.missing_equipment.length === 0).map((e) => e.id).sort((a, b) => a - b);
      check('only_available keeps exactly the rows whose annotation misses nothing', same(ids(avail), expected), `${ids(avail).length} vs ${expected.length}`);
      check(
        'the movement that needs unowned kit is gone; the owned-kit and the kit-less ones stay',
        !has(avail, idMiss) && has(avail, idHave) && has(avail, idNone),
        `miss ${has(avail, idMiss)} have ${has(avail, idHave)} none ${has(avail, idNone)}`,
      );
      check('and what is kept is still annotated (the flags did not go away)', avail.rows.every((e) => Array.isArray(e.missing_equipment) && Array.isArray(e.conflicts)), '');
    }

    // CT-1.3 — hide_conflicts, same agreement. The client's knee is at 'avoid' (earlier in this section).
    {
      const calm = await walk(`for_client=${linkId}&hide_conflicts=1`);
      const expected = plain.rows.filter((e) => e.conflicts.length === 0).map((e) => e.id).sort((a, b) => a - b);
      check('hide_conflicts keeps exactly the rows whose annotation flags nothing', same(ids(calm), expected), `${ids(calm).length} vs ${expected.length}`);
      check('the knee-loading movement is hidden, the others stay', !has(calm, idKnee) && has(calm, idHave) && has(calm, idNone), `knee ${has(calm, idKnee)}`);
      const both = await walk(`for_client=${linkId}&only_available=1&hide_conflicts=1`);
      const expectedBoth = plain.rows
        .filter((e) => e.missing_equipment.length === 0 && e.conflicts.length === 0)
        .map((e) => e.id)
        .sort((a, b) => a - b);
      check('the two switches combine (both must hold)', same(ids(both), expectedBoth), `${ids(both).length} vs ${expectedBoth.length}`);
    }

    // The pagination honesty check. If the narrowing were done on the returned page, a page would
    // come back SHORT while the cursor still said there was more. Server-side: every page but the
    // last is full.
    {
      const small = await walk(`for_client=${linkId}&only_available=1`, 2);
      check('the filtered set is big enough for the pagination check to mean something', small.rows.length >= 3, `${small.rows.length} rows`);
      check(
        'every page but the last is FULL — the narrowing happens before the page is cut',
        small.pages.length > 1 && small.pages.slice(0, -1).every((p) => p.length === 2),
        `page sizes ${small.pages.map((p) => p.length)}`,
      );
    }

    // "Unknown", not "owns nothing": a client with no equipment on record must not get an empty list.
    {
      await call(`/api/v1/clients/${linkId}/onboarding/equipment`, { method: 'PATCH', jar: coachA, body: { equipment: [] } });
      const { json: first } = await call(`/api/v1/exercises?for_client=${linkId}&only_available=1&limit=5`, { jar: coachA });
      const unk = await walk(`for_client=${linkId}&only_available=1`);
      check(
        'with no equipment on record only_available filters nothing, and the answer says so',
        first?.for_client?.equipment_known === false && has(unk, idMiss) && has(unk, idHave),
        `equipment_known ${first?.for_client?.equipment_known}`,
      );
      await call(`/api/v1/clients/${linkId}/onboarding/equipment`, { method: 'PATCH', jar: coachA, body: { equipment: wanted } });
      const { json: known } = await call(`/api/v1/exercises?for_client=${linkId}&limit=1`, { jar: coachA });
      check('with equipment on record the answer says known', known?.for_client?.equipment_known === true, `${known?.for_client?.equipment_known}`);
      const { json: ordinary } = await call('/api/v1/exercises?limit=1', { jar: coachA });
      check('the plain listing has no for_client block at all', ordinary && !('for_client' in ordinary), `${Object.keys(ordinary ?? {})}`);
    }

    // Ownership is checked BEFORE the list is built, so an empty page cannot be a way to probe.
    {
      const otherCoach = new Jar();
      await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: otherCoach });
      const { res: empty } = await call(`/api/v1/exercises?for_client=${linkId}&q=zzqxjvk`, { jar: otherCoach });
      const { res: toggled } = await call(`/api/v1/exercises?for_client=${linkId}&only_available=1&hide_conflicts=1`, { jar: otherCoach });
      check(
        "another coach gets 404 for a client that is not theirs — even when the page would be empty, even with the switches",
        empty.status === 404 && toggled.status === 404,
        `${empty.status}/${toggled.status}`,
      );
    }
  }

```

- [ ] **Step 2: Run the smoke suite and confirm the new checks fail**

Run (from `D:\app\backend`):

```bash
npm run smoke 2>&1 | tail -60
```

Expected: the section's checks **FAIL** — at least `equipment=a,b is ANY-of…`, `only_available / hide_conflicts without for_client are 400…`, `only_available keeps exactly…`, `hide_conflicts keeps exactly…`, `every page but the last is FULL…`, the `equipment_known` checks and the empty-page `404`. The suite ends `failed > 0`. If it fails with `0xC0000005` / status `3221225477` in a *setup* step, that is the known Windows native crash — run it again.

- [ ] **Step 3: Implement — the query schema**

In `backend/src/exercises/routes.js`, replace the `equipment` line of `ListQuery`, add the two switches, and add a `superRefine`. Replace this:

```js
    equipment: z.string().trim().max(40).optional(),
```

with:

```js
    // One slug, or a comma-separated set (`?equipment=barbell,dumbbell`): ANY-of. 16 x 40 + 15
    // separators is the longest honest value; the count itself is checked in `superRefine`.
    equipment: z.string().trim().max(700).optional(),
```

and replace this (the last two properties and the closing of the object):

```js
    for_client: z.coerce.number().int().positive().optional(),
  })
  .strict();
```

with:

```js
    for_client: z.coerce.number().int().positive().optional(),
    // Narrow the result set by what the client can do. Server-side on purpose: the list is
    // cursor-paginated, and narrowing a returned page client-side leaves a short page under a
    // cursor that still says "more" (ADR-0012). Only `1` is a value; `0` is a typo, not "off".
    only_available: z.enum(['1']).optional(),
    hide_conflicts: z.enum(['1']).optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    const slugs = equipmentSlugsOf(q.equipment);
    if (slugs.length > MAX_EQUIPMENT_FILTER || slugs.some((s) => s.length > 40)) {
      ctx.addIssue({ code: 'custom', path: ['equipment'], message: 'too many, or too long, equipment slugs' });
    }
    // A switch that silently does nothing is the thing ADR-0012 refuses.
    if ((q.only_available || q.hide_conflicts) && !q.for_client) {
      ctx.addIssue({ code: 'custom', path: ['for_client'], message: 'only_available and hide_conflicts need for_client' });
    }
  });
```

Immediately **above** `const ListQuery = z`, add the two helpers it uses:

```js
/** The taxonomy is 16 rows; a request naming more than that is not a real request. */
const MAX_EQUIPMENT_FILTER = 16;

/** `?equipment=a,b,c` -> ['a','b','c']: trimmed, de-duplicated, empties dropped. One slug is a list of one. */
const equipmentSlugsOf = (raw) => [...new Set((raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))];

/** Severities that are FLAGGED on a row and, with `hide_conflicts`, hide it. 'past' is history, not a warning. */
const FLAGGED_SEVERITIES = "'avoid', 'caution'";
```

- [ ] **Step 4: Implement — resolve the client once, up front**

Replace the whole of `annotateForClient`'s opening (the doc comment stays; the signature and the ownership block change). Replace this:

```js
async function annotateForClient(rows, linkId, coachId) {
  if (!rows.length) return null;

  // Ownership first, and it is the ONLY thing that decides whether this data is readable. A link
  // id is guessable, so the predicate is what stops a stranger reading a client's injuries.
  const link = await db.get(
    `SELECT cc.client_id FROM coach_clients cc
      WHERE cc.id = ? AND cc.coach_id = ? AND cc.status = 'active'`,
    [linkId, coachId],
  );
  if (!link) return { forbidden: true };

  const ids = rows.map((r) => r.id);
```

with:

```js
async function annotateForClient(rows, clientId) {
  if (!rows.length) return null;

  const ids = rows.map((r) => r.id);
```

In the same function replace `[...ids, link.client_id],` with `[...ids, clientId],` and `[link.client_id, ...ids],` with `[clientId, ...ids],`, and replace the severity line `AND l.severity IN ('avoid', 'caution')`, with:

```js
          AND l.severity IN (${FLAGGED_SEVERITIES})`,
```

(the template literal already interpolates `${holes}` in that statement, so this is the same kind of static interpolation).

Add the ownership helper directly **above** `annotateForClient`'s doc comment:

```js
/**
 * The client user id behind a coach_clients link, or null.
 *
 * Ownership first, and it is the ONLY thing that decides whether `for_client` data is readable. A
 * link id is guessable, so the predicate — this coach, an ACTIVE link — is what stops a stranger
 * reading a client's injuries. Resolved BEFORE the list is built: the two switches put the client
 * id into the list query itself, and an empty page must not be a way to ask "is this link mine".
 */
async function clientOf(linkId, coachId) {
  const link = await db.get(
    `SELECT cc.client_id FROM coach_clients cc
      WHERE cc.id = ? AND cc.coach_id = ? AND cc.status = 'active'`,
    [linkId, coachId],
  );
  return link?.client_id ?? null;
}
```

- [ ] **Step 5: Implement — the handler**

In the `router.get('/exercises', …)` handler:

1. After `const userId = req.user.id;` add:

```js
    // The client behind `for_client`, before anything is built (see `clientOf`). Not this coach's
    // link, or not active: 404 rather than 403 — the caller must not be able to tell "that link
    // exists but is not yours" from "no such link".
    let clientId = null;
    let equipmentKnown = false;
    if (qs.for_client) {
      clientId = await clientOf(qs.for_client, userId);
      if (clientId === null) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
      // An empty set is "unknown", not "owns nothing" (see the switch below).
      equipmentKnown = !!(await db.get('SELECT 1 AS known FROM onboarding_equipment WHERE user_id = ? LIMIT 1', [clientId]));
    }
```

2. Replace the single-slug equipment block:

```js
    if (qs.equipment) {
      where.push(
        'EXISTS (SELECT 1 FROM exercise_equipment_map x JOIN equipment q ON q.id = x.equipment_id WHERE x.exercise_id = e.id AND q.slug = ?)',
      );
      params.push(qs.equipment);
    }
```

with:

```js
    const kit = equipmentSlugsOf(qs.equipment);
    if (kit.length) {
      // ANY-of the ticked set. The placeholders are the only thing built from the input's SHAPE;
      // the slugs themselves are bound.
      where.push(
        `EXISTS (SELECT 1 FROM exercise_equipment_map x JOIN equipment q ON q.id = x.equipment_id
                  WHERE x.exercise_id = e.id AND q.slug IN (${kit.map(() => '?').join(',')}))`,
      );
      params.push(...kit);
    }
    if (qs.only_available === '1' && equipmentKnown) {
      // The predicate behind `missing_equipment`, negated: no kit row of this exercise that the
      // client did not tick. A kit-less movement qualifies (it needs nothing). Skipped when the
      // client has NO equipment on record — "unknown" must not read as "owns nothing", which
      // would answer every kit-using movement with an empty list.
      where.push(
        `NOT EXISTS (SELECT 1 FROM exercise_equipment_map x
                      WHERE x.exercise_id = e.id
                        AND NOT EXISTS (SELECT 1 FROM onboarding_equipment oe
                                         WHERE oe.user_id = ? AND oe.equipment_id = x.equipment_id))`,
      );
      params.push(clientId);
    }
    if (qs.hide_conflicts === '1') {
      // The predicate behind `conflicts`, negated: the same join, the same severities.
      where.push(
        `NOT EXISTS (SELECT 1 FROM exercise_muscle_map m
                       JOIN body_area_muscle_map bam ON bam.muscle_group_id = m.muscle_group_id
                       JOIN onboarding_limitations l ON l.body_area = bam.body_area AND l.user_id = ?
                      WHERE m.exercise_id = e.id AND l.severity IN (${FLAGGED_SEVERITIES}))`,
      );
      params.push(clientId);
    }
```

These pushes sit **before** the cursor block, so the bound-parameter order still matches the `?` order in the statement (the cursor pushes come after).

3. Replace the `if (qs.for_client) { … }` block and the final `res.json` with:

```js
    if (clientId !== null) {
      const fit = await annotateForClient(page, clientId);
      if (fit?.byId) {
        for (const row of page) {
          const f = fit.byId.get(row.id);
          row.missing_equipment = f?.missing_equipment ?? [];
          row.conflicts = f?.conflicts ?? [];
        }
      }
    }

    res.json({
      exercises: page,
      nextCursor,
      // Only with `for_client`: the plain listing carries no client data at all.
      ...(clientId === null ? {} : { for_client: { equipment_known: equipmentKnown } }),
    });
```

- [ ] **Step 6: Run the smoke suite and confirm everything passes**

```bash
npm run smoke 2>&1 | tail -40
```

Expected: every new check `PASS`, final line `SMOKE OK`, `0 failed`. Also run the gates that read this file:

```bash
npm run check:routes && npm run check:route-tx && npm run check:admin-audit && npm run verify:schema
```

Expected: all exit 0 (no new route, no write, no schema change).

- [ ] **Step 7: Prove the pagination check can fail (do not skip)**

Temporarily change the `only_available` push to apply **after** the page is cut: in the handler, comment out the `where.push` of the `only_available` predicate and add, just before `res.json`, `if (qs.only_available === '1' && equipmentKnown) page.splice(0, page.length, ...page.filter((r) => !(r.missing_equipment?.length)));`. Run `npm run smoke 2>&1 | grep -i "FULL"` — expected: `every page but the last is FULL…` **FAILS**. Then undo exactly those two temporary edits (do not use `git checkout` on the file: the task's real changes are uncommitted until Step 8 and would be lost) and re-run `npm run smoke` to see `SMOKE OK` again. A check that has never been seen failing is not yet a check.

- [ ] **Step 8: Commit**

```bash
git add backend/src/exercises/routes.js backend/scripts/smoke.js
git commit -m "feat(exercises): multi-valued equipment filter and server-side only_available / hide_conflicts

GET /exercises takes equipment=a,b (any-of, at most 16) and, with for_client, the two switches
only_available=1 and hide_conflicts=1. They narrow in SQL, before the page is cut, so a page is
never short under a cursor that says there is more. The client behind for_client is resolved
first (an empty page can no longer probe a link), an empty equipment set is 'unknown' rather than
'owns nothing', and the response carries for_client.equipment_known. Smoke proves each switch
against the annotation over the whole catalogue, and the pagination check was seen failing.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The data layer (frontend, no UI)

**Files:**
- Modify: `frontend/src/features/library/useExercises.ts`
- Create: `frontend/src/features/library/exerciseFilters.ts`

**Interfaces:**
- Consumes: Task 1's query parameters and `for_client` response block.
- Produces: `ExerciseFilters` with `equipment?: string[]`, `onlyAvailable?`, `hideConflicts?`; `ExercisePage` (`{ exercises, nextCursor, for_client?: { equipment_known: boolean } }`); `SheetFilters`, `NO_SHEET_FILTERS`, `sheetFilterCount(f)`.

- [ ] **Step 1: Widen `ExerciseFilters` and the query string**

In `useExercises.ts` replace `equipment?: string;` (inside `ExerciseFilters`) with:

```ts
  /** ANY-of: a row matches when it uses at least one of these slugs (the vocabulary of `Taxonomy.slug`). */
  equipment?: string[];
```

and add, after `forClient?: number;` (before the closing brace):

```ts
  /**
   * Both need `forClient` (the server answers 400 otherwise) and both narrow SERVER-side, before
   * the page is cut. Off is "not sent", never `0`.
   */
  onlyAvailable?: boolean;
  hideConflicts?: boolean;
```

In `toQuery`, replace `if (filters.equipment) p.set('equipment', filters.equipment);` with:

```ts
  if (filters.equipment?.length) p.set('equipment', filters.equipment.join(','));
```

and after the `forClient` line add:

```ts
  if (filters.onlyAvailable) p.set('only_available', '1');
  if (filters.hideConflicts) p.set('hide_conflicts', '1');
```

- [ ] **Step 2: Type the page**

Above `useExercises` add:

```ts
export interface ExercisePage {
  exercises: ExerciseRow[];
  nextCursor: string | null;
  /** Only when `forClient` was asked for. `false`: the client has no equipment on record, so `onlyAvailable` filters nothing. */
  for_client?: { equipment_known: boolean };
}
```

and change the generic in `useExercises` from `apiWithRefresh<{ exercises: ExerciseRow[]; nextCursor: string | null }>(` to `apiWithRefresh<ExercisePage>(`.

- [ ] **Step 3: Create the pure filter helpers**

Create `frontend/src/features/library/exerciseFilters.ts`:

```ts
/**
 * What the filter sheet edits. Muscle and the search text are NOT here: they live on the screen
 * (the library's figure and chip strip, the picker's chip row), because they are not behind the
 * funnel.
 */
export interface SheetFilters {
  /** Equipment slugs, ANY-of. */
  equipment: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  type?: 'strength' | 'stretching' | 'cardio' | 'mobility' | 'plyometrics';
  /** Coach context only. */
  onlyAvailable: boolean;
  /** Coach context only. */
  hideConflicts: boolean;
}

export const NO_SHEET_FILTERS: SheetFilters = { equipment: [], onlyAvailable: false, hideConflicts: false };

/**
 * The number on the funnel: how many FILTERS narrow the list, not how many values are ticked —
 * three ticked kits are one filter ("equipment"). 0 draws no badge.
 */
export function sheetFilterCount(f: SheetFilters): number {
  return (
    (f.equipment.length > 0 ? 1 : 0) +
    (f.difficulty ? 1 : 0) +
    (f.type ? 1 : 0) +
    (f.onlyAvailable ? 1 : 0) +
    (f.hideConflicts ? 1 : 0)
  );
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd frontend && npx tsc -b
```

Expected: exit 0. (`LibraryPage` does not pass `equipment`, so no caller breaks.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/library/useExercises.ts frontend/src/features/library/exerciseFilters.ts
git commit -m "feat(library): the exercise list hook speaks multi-valued equipment and the two switches

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The filter sheet, mounted in the library (CT-2.2, CT-2.5)

**Files:**
- Create: `frontend/src/features/library/ExerciseFilterSheet.tsx`
- Modify: `frontend/src/features/library/LibraryPage.tsx`
- Modify: `frontend/src/i18n/hu.json`, `en.json`, `de.json`

**Interfaces:**
- Consumes: Task 2's `SheetFilters`, `NO_SHEET_FILTERS`, `sheetFilterCount`, `Taxonomy`; kit parts `Sheet` (`ui/feedback/variants/E14E20`), `Chip`, `ChipRow`, `Toggle`, `Switch`, `ListRow`, `RowStack`, `SectionHeader`, `TextLink`, `Pressable`, `BadgeCount`.
- Produces: `FilterButton({ count, onClick })`; `ExerciseFilterSheet({ open, onClose, value, onChange, equipment, client? })` where `client` is `{ equipmentKnown: boolean | undefined }` and **its absence removes the two switches from the tree**.

- [ ] **Step 1: Add the strings (all three languages)**

Use a node script so the CRLF files keep their endings. Create the script in the scratchpad (not the repo) as `add-filter-keys.mjs`:

```js
import fs from 'node:fs';

const add = {
  hu: {
    filters: {
      open: 'Szűrők',
      openActive: 'Szűrők, {{count}} aktív',
      title: 'Szűrők',
      difficulty: 'Nehézség',
      type: 'Típus',
      onlyAvailable: 'Csak amihez van eszköze',
      onlyAvailableHint: 'Kihagyja azokat, amikhez az ügyfélnek hiányzik eszköze.',
      onlyAvailableUnknown: 'Ennél az ügyfélnél nincs rögzített felszerelés, ezért ez a szűrő most nem szűr.',
      hideConflicts: 'Konfliktusok elrejtése',
      hideConflictsHint: 'Kihagyja azokat, amelyek az ügyfél jelzett testtájait terhelik.',
      done: 'Kész',
    },
    plans: {
      pickerMore: 'Továbbiak',
      pickerMuscles: 'Izomcsoport',
      pickerEmptyFiltered: 'Nincs találat ezekkel: {{filters}}.',
    },
  },
  en: {
    filters: {
      open: 'Filters',
      openActive: 'Filters, {{count}} active',
      title: 'Filters',
      difficulty: 'Difficulty',
      type: 'Type',
      onlyAvailable: 'Only what they have kit for',
      onlyAvailableHint: 'Leaves out movements that need equipment the client lacks.',
      onlyAvailableUnknown: 'This client has no equipment on record, so this filter does nothing yet.',
      hideConflicts: 'Hide conflicts',
      hideConflictsHint: 'Leaves out movements that load the client’s flagged body areas.',
      done: 'Done',
    },
    plans: {
      pickerMore: 'Show more',
      pickerMuscles: 'Muscle group',
      pickerEmptyFiltered: 'Nothing matches {{filters}}.',
    },
  },
  de: {
    filters: {
      open: 'Filter',
      openActive: 'Filter, {{count}} aktiv',
      title: 'Filter',
      difficulty: 'Schwierigkeit',
      type: 'Typ',
      onlyAvailable: 'Nur, wofür Geräte da sind',
      onlyAvailableHint: 'Lässt Übungen weg, für die dem Klienten Geräte fehlen.',
      onlyAvailableUnknown: 'Für diesen Klienten ist keine Ausstattung hinterlegt, daher filtert das noch nichts.',
      hideConflicts: 'Konflikte ausblenden',
      hideConflictsHint: 'Lässt Übungen weg, die die gemeldeten Körperbereiche des Klienten belasten.',
      done: 'Fertig',
    },
    plans: {
      pickerMore: 'Mehr anzeigen',
      pickerMuscles: 'Muskelgruppe',
      pickerEmptyFiltered: 'Keine Treffer für {{filters}}.',
    },
  },
};

for (const lang of ['hu', 'en', 'de']) {
  const p = `D:/app/frontend/src/i18n/${lang}.json`;
  const raw = fs.readFileSync(p, 'utf8');
  const json = JSON.parse(raw);
  json.filters = add[lang].filters;
  Object.assign(json.plans, add[lang].plans);
  const out = JSON.stringify(json, null, 2).replace(/\n/g, '\r\n') + (raw.endsWith('\n') ? '\r\n' : '');
  fs.writeFileSync(p, out);
}
```

Run `node <scratchpad>/add-filter-keys.mjs`, then `git diff --stat frontend/src/i18n` — expected: three files, only added lines (no whole-file churn). `filters` is a **new top-level block**; confirm no `filters` key existed first (`grep -c '"filters"' frontend/src/i18n/hu.json` → `0` before the run).

- [ ] **Step 2: Create the sheet**

Create `frontend/src/features/library/ExerciseFilterSheet.tsx`:

```tsx
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Funnel } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { BadgeCount } from '../../ui/primitives/BadgeCount';
import { Chip, ChipRow } from '../../ui/primitives/ChipRow';
import { Toggle } from '../../ui/primitives/Toggle';
import { Switch } from '../../ui/primitives/Switch';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow } from '../../ui/data/ListRow';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { sheetFilterCount, type SheetFilters } from './exerciseFilters';
import type { Taxonomy } from './useExercises';

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
const TYPES = ['strength', 'stretching', 'cardio', 'mobility', 'plyometrics'] as const;

/**
 * The funnel: an icon button with the count of active filters on its corner (the kit's
 * `BadgeCount`, hidden at 0). The count belongs in the accessible name — the badge itself is
 * `aria-hidden` — so a screen reader hears "Szűrők, 2 aktív" once, not "Szűrők" and a loose "2".
 */
export function FilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      variant="link"
      shape="icon"
      className="relative"
      aria-label={count > 0 ? t('filters.openActive', { count }) : t('filters.open')}
      aria-haspopup="dialog"
      onClick={onClick}
    >
      <Funnel aria-hidden />
      <BadgeCount count={count} />
    </Pressable>
  );
}

export interface ExerciseFilterSheetProps {
  open: boolean;
  onClose: () => void;
  value: SheetFilters;
  onChange: (next: SheetFilters) => void;
  /** The equipment taxonomy (labels already in the reader's language); `undefined` while it loads. */
  equipment: Taxonomy[] | undefined;
  /**
   * Present ONLY in the coach context (a client's plan). Its absence removes the two switches from
   * the tree — a template plan has no client, and a disabled switch would promise a filter that
   * cannot exist. `equipmentKnown` is `false` when the client has no equipment on record.
   */
  client?: { equipmentKnown: boolean | undefined };
}

/**
 * The filter sheet behind the funnel (ADR-0012, CT-2.2): equipment (multi), difficulty, type and —
 * for a client's plan — the two switches, ALL OFF until the coach turns them on. A change applies
 * at once (the list behind the sheet follows); "Kész" only closes.
 *
 * Muscle is not here: it stays on the figure / chip strip, the app's signature control (CT-2.3).
 */
export function ExerciseFilterSheet({ open, onClose, value, onChange, equipment, client }: ExerciseFilterSheetProps) {
  const { t } = useTranslation();
  const id = useId();
  const count = sheetFilterCount(value);

  const toggleKit = (slug: string) =>
    onChange({
      ...value,
      equipment: value.equipment.includes(slug) ? value.equipment.filter((s) => s !== slug) : [...value.equipment, slug],
    });

  return (
    <Sheet open={open} onClose={onClose} title={t('filters.title')}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col">
          <SectionHeader rule={false} title={t('library.equipment')} />
          <ChipRow label={t('library.equipment')} wrap>
            {(equipment ?? []).map((e) => (
              <Toggle key={e.slug} on={value.equipment.includes(e.slug)} label={e.name} onToggle={() => toggleKit(e.slug)} />
            ))}
          </ChipRow>
        </div>

        <div className="flex flex-col">
          <SectionHeader rule={false} title={t('filters.difficulty')} />
          <ChipRow label={t('filters.difficulty')} wrap>
            {DIFFICULTIES.map((d) => (
              <Chip
                key={d}
                role="radio"
                aria-checked={value.difficulty === d}
                selected={value.difficulty === d}
                // Tapping the chosen one again clears it: a single-select with no "all" chip.
                onClick={() => onChange({ ...value, difficulty: value.difficulty === d ? undefined : d })}
              >
                {t(`library.difficulty.${d}`)}
              </Chip>
            ))}
          </ChipRow>
        </div>

        <div className="flex flex-col">
          <SectionHeader rule={false} title={t('filters.type')} />
          <ChipRow label={t('filters.type')} wrap>
            {TYPES.map((k) => (
              <Chip
                key={k}
                role="radio"
                aria-checked={value.type === k}
                selected={value.type === k}
                onClick={() => onChange({ ...value, type: value.type === k ? undefined : k })}
              >
                {t(`library.type.${k}`)}
              </Chip>
            ))}
          </ChipRow>
        </div>

        {client ? (
          <RowStack as="div">
            <ListRow
              title={t('filters.onlyAvailable')}
              titleId={`${id}-avail`}
              sub={<span id={`${id}-avail-hint`}>{client.equipmentKnown === false ? t('filters.onlyAvailableUnknown') : t('filters.onlyAvailableHint')}</span>}
              subLines={3}
              control={
                <Switch
                  checked={value.onlyAvailable}
                  labelledBy={`${id}-avail`}
                  describedBy={`${id}-avail-hint`}
                  onChange={(next) => onChange({ ...value, onlyAvailable: next })}
                />
              }
            />
            <ListRow
              title={t('filters.hideConflicts')}
              titleId={`${id}-conf`}
              sub={<span id={`${id}-conf-hint`}>{t('filters.hideConflictsHint')}</span>}
              subLines={3}
              control={
                <Switch
                  checked={value.hideConflicts}
                  labelledBy={`${id}-conf`}
                  describedBy={`${id}-conf-hint`}
                  onChange={(next) => onChange({ ...value, hideConflicts: next })}
                />
              }
            />
          </RowStack>
        ) : null}

        <div className="flex items-center justify-between">
          <TextLink
            text="body"
            disabled={count === 0}
            onClick={() => onChange({ equipment: [], onlyAvailable: false, hideConflicts: false })}
          >
            {t('library.clearFilters')}
          </TextLink>
          <TextLink text="body" onClick={onClose}>
            {t('filters.done')}
          </TextLink>
        </div>
      </div>
    </Sheet>
  );
}
```

If `tsc` rejects a prop (`aria-checked` on `Chip`, `disabled` on `TextLink`, `subLines`, `control`), open the component and use its real prop: `Chip` extends the button attributes, `ListRow` has `control` and `subLines` (see `features/settings/CueSettings.tsx`), `TextLink` — check `ui/primitives/TextLink.tsx`; if it has no `disabled`, render the clear link only when `count > 0`.

- [ ] **Step 3: Mount it in the library**

In `LibraryPage.tsx`:

1. Imports — add:

```tsx
import { FilterButton, ExerciseFilterSheet } from './ExerciseFilterSheet';
import { NO_SHEET_FILTERS, sheetFilterCount, type SheetFilters } from './exerciseFilters';
```

2. State — after `const debouncedSearch = useDebounced(search, 300);` add:

```tsx
  // The funnel's filters: equipment (the strip that was cut in August, back behind a sheet instead
  // of a second chip row), difficulty and type. The library has no client, so no coach switches.
  const [sheet, setSheet] = useState<SheetFilters>(NO_SHEET_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeFilters = sheetFilterCount(sheet);
```

3. Replace the `filters` memo **and the comment block above it** (the one starting `No \`equipment\` filter`) with:

```tsx
  const filters: ExerciseFilters = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      muscle,
      equipment: sheet.equipment.length ? sheet.equipment : undefined,
      difficulty: sheet.difficulty,
      type: sheet.type,
    }),
    [debouncedSearch, muscle, sheet],
  );
```

4. `clearAll` — also reset the sheet:

```tsx
  const clearAll = () => {
    setSearch('');
    setMuscle(undefined);
    setSheet(NO_SHEET_FILTERS);
  };
```

5. The header's `trailing` is one node; it must now hold the funnel **and** the search/close glyph. Wrap the existing ternary result and the funnel in a fragment: change `trailing={ !searchShown ? (...) : search === '' ? (...) : undefined }` to

```tsx
        trailing={
          <>
            <FilterButton count={activeFilters} onClick={() => setSheetOpen(true)} />
            {!searchShown ? (
              /* …the existing search glyph, unchanged… */
            ) : search === '' ? (
              /* …the existing close glyph, unchanged… */
            ) : null}
          </>
        }
```

(keep the two existing `<Pressable>` elements exactly as they are, only the surrounding ternary changes `undefined` to `null`). If `ScreenHeader` lays `trailing` out as a single 44 pt slot and the two buttons collide, wrap them in `<span className="flex items-center">` and check the result in Step 6.

6. Empty-state action — change `search || muscle ? (` to `search || muscle || activeFilters > 0 ? (`.

7. Mount the sheet once, just before the closing `</Screen>`:

```tsx
      <ExerciseFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        value={sheet}
        onChange={setSheet}
        equipment={taxonomies.data?.equipment}
      />
```

- [ ] **Step 4: Build**

```bash
cd frontend && npm run build 2>&1 | tail -30
```

Expected: exit 0 — `check:tokens`, `check:i18n` (key counts equal across hu/en/de), `check:elements`, `tsc -b`, `vite build` all green. A `check:tokens` failure means a raw element crept in; fix by composing a kit part.

- [ ] **Step 5: Walk it in the running app**

Start the dev environment the way the repo's `.claude/launch.json` defines it (`preview_start`), sign in as the seeded **user@tracker.local** (dev credentials come from `npm run seed:dev-users` — use the project's seed file values, never real ones). Open `/library`, then in a **desktop-width** browser pane (mobile touch emulation does not register coordinate clicks; JS `.click()` works):

1. The funnel shows no badge. Open it: equipment chips (16, translated), difficulty and type chips, **no** coach switches.
2. Tick one equipment → the list changes behind the sheet, the badge reads `1`. Tick a second → still `1` (one filter), list widens (any-of).
3. Pick a difficulty → badge `2`. Tap it again → cleared, badge `1`.
4. Close, search for a word that cannot match → the empty state offers "Szűrők törlése"; tapping it clears search, muscle **and** the sheet.
5. Switch language to `de` and `en` → labels change; no raw keys on screen.
6. `read_network_requests` → the list request carries `equipment=a,b` (comma list) and no `only_available`.

Report what you saw. If any step fails, fix it before committing.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/library frontend/src/i18n
git commit -m "feat(library): a filter sheet behind a funnel badge - equipment, difficulty, type

The equipment filter the library lost in August returns without a second chip strip: it is one
section of the sheet, with difficulty and type, and the funnel carries the count of active
filters. The sheet takes an optional client; without it the two coach switches are not rendered
(the picker passes it in the next change).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The picker (CT-2.2, CT-2.3, CT-2.4 + the edge cases)

**Files:**
- Modify: `frontend/src/features/plans/ExercisePicker.tsx`

**Interfaces:**
- Consumes: Task 3's `FilterButton`, `ExerciseFilterSheet`; Task 2's `SheetFilters`, `ExercisePage`; `useTaxonomies`.
- Produces: the picker with a muscle chip row, the funnel, all loaded pages (no 12-row cap) and a "Továbbiak" control; the two switches present **only when `forClient` is set**.

- [ ] **Step 1: State and the query**

In `ExercisePicker.tsx`:

1. Imports — add `useMemo` is already imported; add:

```tsx
import { ChipRow, Chip } from '../../ui/primitives/ChipRow';
import { FilterButton, ExerciseFilterSheet } from '../library/ExerciseFilterSheet';
import { NO_SHEET_FILTERS, sheetFilterCount, type SheetFilters } from '../library/exerciseFilters';
import { useExercises, useTaxonomies, type ExerciseRow } from '../library/useExercises';
```

(replace the existing `useExercises, type ExerciseRow` import line).

2. In `ExercisePicker`, after `const [picking, setPicking] = useState<number | null>(null);` add:

```tsx
  // Filters. Off until the coach turns them on (ADR-0012): with all of them off this picker asks
  // the server exactly what it asked before, and every row stays flagged, never hidden.
  const [muscle, setMuscle] = useState<string>();
  const [sheet, setSheet] = useState<SheetFilters>(NO_SHEET_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const taxonomies = useTaxonomies(lang);
  const activeFilters = sheetFilterCount(sheet) + (muscle ? 1 : 0);
```

3. Replace `const query = useExercises({ q: debounced || undefined, forClient }, lang);` with:

```tsx
  const query = useExercises(
    {
      q: debounced || undefined,
      muscle,
      equipment: sheet.equipment.length ? sheet.equipment : undefined,
      difficulty: sheet.difficulty,
      type: sheet.type,
      forClient,
      // The two switches exist only for a client's plan; a template plan never sends them.
      onlyAvailable: forClient && sheet.onlyAvailable ? true : undefined,
      hideConflicts: forClient && sheet.hideConflicts ? true : undefined,
    },
    lang,
  );
```

- [ ] **Step 2: Read every loaded page, drop the cap**

Replace the block from `const [settled, setSettled]` through `const loading = …;` with the version below. **`answered` must be memoised** — it is an effect dependency, and a fresh array every render would loop forever.

```tsx
  // The previous answer stays on screen while the next one is on its way (the query key changes
  // with every settled search term / filter, and a changed key has no data): otherwise the list
  // would blink to skeletons on every keystroke pause. `settled` is the last answer that was real.
  const [settled, setSettled] = useState<ExerciseRow[] | null>(null);
  const answered = useMemo(() => query.data?.pages.flatMap((p) => p.exercises), [query.data]);
  useEffect(() => {
    if (answered) setSettled(answered);
  }, [answered]);
  // No `.slice(0, 12)` any more: a filter that leaves thirty matches must not show twelve of them
  // as if that were all. The scroll box is what bounds the height; "Továbbiak" fetches the next page.
  const rows = answered ?? settled ?? [];
  const failed = query.isError && !answered;
  const refreshing = !answered && settled !== null && !failed;
  // First load only: nothing answered yet, nothing to show.
  const loading = !answered && settled === null && !failed;
  // Whether the client has equipment on record: drives the hint under "only what they have kit for".
  const equipmentKnown = query.data?.pages[0]?.for_client?.equipment_known;
```

- [ ] **Step 3: The search line, the muscle chips and the funnel**

Replace the line `<Field label={t('plans.findExercise')} value={search} autoFocus onChange={(e) => setSearch(e.target.value)} />` with:

```tsx
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label={t('plans.findExercise')} value={search} autoFocus onChange={(e) => setSearch(e.target.value)} />
        </div>
        <FilterButton count={sheetFilterCount(sheet)} onClick={() => setSheetOpen(true)} />
      </div>

      {/* Muscle stays a chip row (CT-2.3): the app's signature filter, one tap, not behind the funnel. */}
      {taxonomies.data ? (
        <ChipRow label={t('plans.pickerMuscles')} scroll="bleed">
          {taxonomies.data.muscles.map((m) => (
            <Chip key={m.slug} selected={muscle === m.slug} onClick={() => setMuscle(muscle === m.slug ? undefined : m.slug)}>
              {m.name}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
```

and mount the sheet once, just before the final `<div className="flex h-11 items-center">` ("Mégse") block:

```tsx
      <ExerciseFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        value={sheet}
        onChange={setSheet}
        equipment={taxonomies.data?.equipment}
        client={forClient ? { equipmentKnown } : undefined}
      />
```

- [ ] **Step 4: The honest empty state, and "show more"**

Add, above the `return (`, the names of what is narrowing the list:

```tsx
  /** Words for every filter that is on, so an empty list can say WHICH of them emptied it. */
  const activeWords = (): string[] => {
    const words: string[] = [];
    if (debounced) words.push(`„${debounced}”`);
    if (muscle) words.push(taxonomies.data?.muscles.find((m) => m.slug === muscle)?.name ?? muscle);
    for (const slug of sheet.equipment) words.push(taxonomies.data?.equipment.find((e) => e.slug === slug)?.name ?? slug);
    if (sheet.difficulty) words.push(t(`library.difficulty.${sheet.difficulty}`));
    if (sheet.type) words.push(t(`library.type.${sheet.type}`));
    if (forClient && sheet.onlyAvailable) words.push(t('filters.onlyAvailable'));
    if (forClient && sheet.hideConflicts) words.push(t('filters.hideConflicts'));
    return words;
  };
  const clearAllFilters = () => {
    setSearch('');
    setMuscle(undefined);
    setSheet(NO_SHEET_FILTERS);
  };
```

Replace the empty-state branch

```tsx
      ) : rows.length === 0 ? (
        <NoticeLine tone="info" detail={t('plans.pickerEmptyHint')}>
          {t('plans.pickerEmpty')}
        </NoticeLine>
      ) : (
```

with:

```tsx
      ) : rows.length === 0 ? (
        activeFilters > 0 || debounced ? (
          // Names the filters that are on and offers to clear them: an empty list that does not say
          // why reads as "the library has nothing", which is the conflation PATTERN-GAP already
          // records on six list screens. This must not be a seventh.
          <NoticeLine
            tone="info"
            detail={t('plans.pickerEmptyHint')}
            action={
              <TextLink text="cap" onClick={clearAllFilters}>
                {t('library.clearFilters')}
              </TextLink>
            }
          >
            {t('plans.pickerEmptyFiltered', { filters: activeWords().join(', ') })}
          </NoticeLine>
        ) : (
          <NoticeLine tone="info" detail={t('plans.pickerEmptyHint')}>
            {t('plans.pickerEmpty')}
          </NoticeLine>
        )
      ) : (
```

After the scroll box (`</div>` that closes the `ref={setScroller}` element) and before the sheet, add the "show more" control:

```tsx
      {query.hasNextPage ? (
        <div className="flex h-11 items-center">
          <TextLink text="body" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {t('plans.pickerMore')}
          </TextLink>
        </div>
      ) : null}
```

(Same `TextLink` `disabled` caveat as Task 3: if it has no such prop, drop it and guard with `query.isFetchingNextPage` inside the handler.)

- [ ] **Step 5: Build**

```bash
cd frontend && npm run build 2>&1 | tail -30
```

Expected: exit 0, all gates green.

- [ ] **Step 6: Walk it in the running app**

With the dev servers running and the seeded accounts (`coach@tracker.local` with a linked client — `npm run seed:demo` gives one; use the project's seed files, never real credentials), desktop-width pane:

1. **Client plan.** Open a plan that belongs to a client → `+ Gyakorlat`. Funnel with no badge; a muscle chip row under the search.
2. Tap a muscle chip → the list narrows; tap it again → back. Type a name **and** pick a muscle → both apply.
3. Open the funnel: equipment / difficulty / type **and** the two switches, both **off**. Turn "Csak amihez van eszköze" on → rows with the grey "N eszköz hiányzik" chip disappear; badge `1`. Turn "Konfliktusok elrejtése" on → rows carrying a body-area chip disappear; badge `2`.
4. `read_network_requests`: the list request carries `for_client=<link>&only_available=1&hide_conflicts=1`; with the switches off it carries neither.
5. Scroll to the bottom of a list with more than 24 matches → "Továbbiak" is there and loads the next page; the rows are **not** capped at 12.
6. Make an empty result (a muscle + an equipment that no movement has) → the line names both ("Nincs találat ezekkel: …"), and "Szűrők törlése" restores the list.
7. **Template plan** (no client): open `+ Gyakorlat` → the funnel's sheet has **no** switches at all (absent, not disabled), and the request never carries `for_client`.
8. **Unknown equipment.** In the coach's client screen clear the client's equipment (plan A's card), reopen the picker, open the sheet → the hint under "Csak amihez van eszköze" says there is no equipment on record; turning it on removes nothing.
9. Offline (devtools): the filters still respond from cache/err gracefully; the pick itself stays disabled as before.

Report each result. Fix anything that fails before committing.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/plans/ExercisePicker.tsx
git commit -m "feat(plans): the exercise picker filters - muscle chips, a filter sheet, the coach's two switches

The picker gains a muscle chip row, the funnel with its sheet and, for a client's plan only, the
two opt-in switches (both off; absent on a template plan). It now shows every loaded page with a
'show more' control instead of cutting at twelve, and an empty result names the filters that
emptied it and offers to clear them.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Docs and the full gate run

**Files:**
- Modify: `docs/brain/55-Screens/coach-plan-editor.md`
- Modify: `docs/brain/55-Screens/library.md`
- Regenerate: `docs/brain/30-API/Endpoints.md` (and whatever else `brain:gen` rewrites)

- [ ] **Step 1: Update the two screen specs**

Screen specs are updated **in the phase that ships the screen** (spec CT-3.3), so this is the point. Read each file first, then:

- `coach-plan-editor.md` — find the sentence that says results are *flagged, never filtered* and add the ADR-0012 clause: results are flagged **by default**, and narrowed only on explicit request through the filter sheet (equipment, difficulty, type, the two client switches) and the muscle chip row; the switches are absent on a template plan; an empty result names the filters and offers to clear them; the picker shows every loaded page with "Továbbiak". Link `[[0012-opt-in-exercise-filtering]]`.
- `library.md` — replace the "equipment strip was cut" note with: equipment (with difficulty and type) is back behind the funnel in the filter sheet; no second chip strip. Link the same ADR.

- [ ] **Step 2: Regenerate the generated brain pages**

```bash
cd backend && npm run brain:gen
git diff --stat docs/brain | tail -5
```

`brain:gen` reads the live database and rewrites every generated page's date and row counts, so the diff will be wider than this change. **Keep** the `Endpoints.md` hunks that describe `/exercises`; if the rest is date/row-count churn only, `git checkout -- ` those files and commit only `Endpoints.md` (and any page whose *content* changed because of this plan). State in the commit message that the rest was discarded as churn.

- [ ] **Step 3: Run the whole gate suite on fresh databases**

```bash
cd backend
# fresh throwaway database each time (never the dev database): DB_PATH=<scratch file>
DB_PATH=<scratch>/b-check.db npm run migrate && DB_PATH=<scratch>/b-check.db npm run seed:dev-users
DB_PATH=<scratch>/b-check.db npm run check:all
DB_PATH=<scratch>/b-smoke.db npm run migrate && DB_PATH=<scratch>/b-smoke.db npm run seed:dev-users
DB_PATH=<scratch>/b-smoke.db npm run smoke
DB_PATH=<scratch>/b-lim.db   npm run migrate && DB_PATH=<scratch>/b-lim.db   npm run seed:dev-users
DB_PATH=<scratch>/b-lim.db   npm run smoke:limits
cd ../frontend && npm run build
```

Expected: `check:all` exit 0; `SMOKE OK` with the new section's checks included (the count rises from 1364); `LIMITS OK — 7 passed`; the frontend build green. `verify:gates` (inside `check:all`) refuses a **dirty tree** — commit first. A status `3221225477` (`0xC0000005`) in a *setup* step is the known Windows crash: run again before investigating.

- [ ] **Step 4: Commit**

```bash
git add docs/brain
git commit -m "docs: the picker and the library describe the opt-in filters (ADR-0012)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage**

| Spec item | Where |
|---|---|
| CT-1.1 multi-valued `equipment`, capped | Task 1 (any-of `IN`, 16 cap, 400 above) |
| CT-1.2 `only_available`, only with `for_client`, same predicate as `missing_equipment` | Task 1 (400 without; agreement proven against the annotation over the whole catalogue) |
| CT-1.3 `hide_conflicts`, same rule against `body_area_muscle_map` | Task 1 (shared `FLAGGED_SEVERITIES`; agreement check) |
| "must not be done in the browser" | Task 1 (SQL, before the page is cut; the "every page but the last is full" check, **seen failing** in Step 7) |
| CT-2.1 extract the picker | already done (DEV-093) — stated at the top, not re-done |
| CT-2.2 filter sheet behind a funnel badge with the count | Task 3 (`FilterButton`, `ExerciseFilterSheet`) |
| CT-2.3 muscle stays on the map + chip row | Task 3 leaves the library untouched; Task 4 adds the chip row to the picker |
| CT-2.4 the two toggles, coach context only, default off | Task 3 (`client` prop → switches absent without it) + Task 4 (`client` only when `forClient`) |
| CT-2.5 library equipment filter back, no second strip | Task 3 |
| Edge: template plan has no client → toggles absent | Tasks 3–4, checked in Task 4 Step 6.7 |
| Edge: zero results names the filter and offers clear | Task 4 Step 4 |
| Edge: client with no equipment = "unknown" | Task 1 (`equipment_known`, no-op) + Task 3 hint text + Task 4 Step 6.8 |
| Edge: offline — filters are reads | unchanged queries; Task 4 Step 6.9 |
| ADR-0012: default unchanged | Global Constraints + the existing "plain listing carries no client data" smoke check still passes; Task 1 adds "no `for_client` block" |
| CT-3.3-style doc rule | Task 5 |

**Placeholder scan:** no "TBD"/"add handling". Two places say "if `tsc` rejects a prop, use the component's real prop" (`TextLink disabled`, `ListRow` props) — these name the exact files to read and the fallback, because the kit's prop surface was read only partially; the build gate catches either.

**Type consistency:** `SheetFilters` (Task 2) is the type of `value`/`onChange` in `ExerciseFilterSheet` (Task 3) and of the picker/library state (Tasks 3–4); `NO_SHEET_FILTERS` and `sheetFilterCount` are used under those names throughout; `ExerciseFilters.equipment` is `string[]` in Task 2 and the library passes `string[] | undefined` in Task 3; `for_client.equipment_known` (Task 1) is read as `pages[0]?.for_client?.equipment_known` (Task 4) and typed in `ExercisePage` (Task 2); `annotateForClient(rows, clientId)` is changed and called with `clientId` in the same task.

**Known risks the executor should keep in view**
- `annotateForClient` changes signature; `grep -n "annotateForClient" backend/src` must show exactly the one call site.
- Resolving the link up front makes `for_client` with an **empty** page return `404` for a stranger where it used to return `200 []` — stricter, intended, and covered by the last smoke check.
- `answered` in the picker **must** be `useMemo`-ed (Task 4 Step 2) or the `settled` effect loops.
- Equipment is counted as **one** filter on the badge however many kits are ticked (documented in `sheetFilterCount`).
