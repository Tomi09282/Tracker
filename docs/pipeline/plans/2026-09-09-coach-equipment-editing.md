# Equipment Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the client a visible place to change their equipment after onboarding, and give the coach a narrow, audited way to correct it.

**Architecture:** No schema change. The client's path reuses the existing `PATCH /onboarding`, which already accepts `equipment: number[]`. The coach's path is one new route delegating to one new named worker transaction that writes three rows — the equipment set, an `audit_log` row and a `notifications` row — under a single write lock. The static gate that proves admin writes are audited is widened to cover coach cross-user writes, so the next such route cannot ship unaudited.

**Tech Stack:** Node/Express, better-sqlite3-multiple-ciphers in a Piscina worker pool, zod, React 19 + TypeScript + Tailwind, react-i18next, TanStack Query.

This is **plan A of three** for the workstream in [`docs/pipeline/coach-tooling-spec.md`](../coach-tooling-spec.md). It covers CT-1.4, CT-1.5, CT-3.1, CT-3.2, CT-3.3. Plans B (filtering) and C (builder + visual) follow and do not depend on this one.

Branch: `feat/coach-tooling`.

## Global Constraints

- **Every user-visible string exists in `hu`, `en` and `de`.** `npm run check:i18n` sits in the frontend `build` chain; a Hungarian-only string fails the build, not the runtime.
- **No raw interactive element outside `frontend/src/ui/`.** `npm run check:tokens` rejects it. Compose `Pressable`.
- **Every write route carries a rate limiter.** `npm run check:routes` refuses one that does not.
- **No conditional `return` after a write inside a worker transaction.** `.transaction()` commits on return — ADR-0005, enforced by `npm run check:worker-tx`. Throw instead.
- **Object-level miss → 404, role gate → 403.** The coach↔client **link id** is the access key, never a pair of user ids.
- **The audit `detail` is read back off the stored row**, never rebuilt from a JS variable, so the log and the data cannot disagree.
- There is **no unit-test framework in this repo.** Verification is `npm run smoke` (hermetic: throwaway encrypted DB, fresh server) plus the `check:*` / `verify:*` gates. Do not add vitest or jest.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/db/worker.js` | **Modify** — add `setClientEquipmentTx`, the three-row transaction |
| `backend/src/db/index.js` | **Modify** — export the facade call that names it |
| `backend/src/onboarding/routes.js` | **Modify** — add `PATCH /clients/:linkId/onboarding/equipment` |
| `backend/scripts/smoke.js` | **Modify** — the coach-equipment section |
| `backend/scripts/check-admin-audit.mjs` | **Modify** — widen the rule to coach cross-user writes |
| `frontend/src/ui/primitives/Toggle.tsx` | **Create** — `Toggle` promoted out of `OnboardingPage`, now that two screens use it |
| `frontend/src/features/onboarding/OnboardingPage.tsx` | **Modify** — import the promoted `Toggle`, delete the local copy |
| `frontend/src/features/settings/EquipmentSection.tsx` | **Create** — the client's own editor |
| `frontend/src/features/settings/SettingsPage.tsx` | **Modify** — mount it as the seventh section |
| `frontend/src/features/coaching/ClientEquipmentCard.tsx` | **Create** — the coach's editor |
| `frontend/src/features/coaching/useCoaching.ts` | **Modify** — the mutation hook |
| `frontend/src/i18n/{hu,en,de}.json` | **Modify** — new strings, all three |
| `docs/brain/55-Screens/settings.md`, `coach-client-detail.md` | **Modify** — in the task that ships the screen |

---

### Task 1: The coach's equipment write

**Files:**
- Modify: `backend/src/db/worker.js`
- Modify: `backend/src/db/index.js`
- Modify: `backend/src/onboarding/routes.js`
- Test: `backend/scripts/smoke.js`

**Interfaces:**
- Consumes: `coach_clients` (the link), `onboarding_equipment`, `equipment`, `audit_log`, `notifications`; `requireAuth`, `requireCoach` from `../auth/middleware.js`; the write limiter already used by this router.
- Produces: facade call `setClientEquipment({ coachId, linkId, equipmentIds, requestId, ip })` → `{ clientId, count }`; route `PATCH /api/v1/clients/:linkId/onboarding/equipment` taking `{ equipment: number[] }`; audit action string `coach.client.equipment.set`; notification type `profile.equipment_changed`.

- [ ] **Step 1: Write the failing smoke assertions**

Add near the existing coach sections of `backend/scripts/smoke.js`. `coachJar` and the client's link id already exist there; reuse the ones the coaching section set up rather than creating a second pair.

```js
// --- coach writes a client's equipment ------------------------------------------------------
{
  const { json: before } = await call(`/api/v1/clients/${linkId}/onboarding`, { jar: coachJar });
  const had = (before?.profile?.equipment ?? []).map((e) => e.id);

  const { res, json } = await call(`/api/v1/clients/${linkId}/onboarding/equipment`, {
    method: 'PATCH', jar: coachJar, body: { equipment: [1, 2] },
  });
  check('coach may set a client\'s equipment', res.status === 200, `status ${res.status}`);
  check('the response reports what was written', json?.count === 2, JSON.stringify(json));

  const { json: after } = await call(`/api/v1/clients/${linkId}/onboarding`, { jar: coachJar });
  const now = (after?.profile?.equipment ?? []).map((e) => e.id).sort();
  check('the set is replaced, not merged', JSON.stringify(now) === '[1,2]', `was ${had} now ${now}`);

  const { res: bad } = await call(`/api/v1/clients/${linkId}/onboarding/equipment`, {
    method: 'PATCH', jar: coachJar, body: { equipment: [999999] },
  });
  check('an unknown equipment id is refused', bad.status === 400, `status ${bad.status}`);

  const { res: notMine } = await call(`/api/v1/clients/${linkId}/onboarding/equipment`, {
    method: 'PATCH', jar: coach2Jar, body: { equipment: [1] },
  });
  check('another coach gets 404, not 403', notMine.status === 404, `status ${notMine.status}`);

  const { res: asMember } = await call(`/api/v1/clients/${linkId}/onboarding/equipment`, {
    method: 'PATCH', jar: memberJar, body: { equipment: [1] },
  });
  check('a member gets 403 at the role gate', asMember.status === 403, `status ${asMember.status}`);

  const { json: inbox } = await call('/api/v1/notifications', { jar: memberJar });
  check(
    'the client is told their equipment changed',
    (inbox?.notifications ?? []).some((n) => n.type === 'profile.equipment_changed'),
    `${inbox?.notifications?.length ?? 0} rows`,
  );
}
```

- [ ] **Step 2: Run the suite and watch these fail**

```bash
npm --prefix backend run smoke
```

Expected: the six new lines FAIL (`status 404` on the PATCH — the route does not exist). Every pre-existing line still passes. If an older line broke, you changed something you should not have.

- [ ] **Step 3: Write the transaction**

In `backend/src/db/worker.js`, beside the other named transactions. `current` tracks the step so a throw names it; the audit detail is read back off the stored rows.

```js
export function setClientEquipmentTx({ coachId, linkId, equipmentIds, requestId, ip }) {
  let current = 'SELECT link';
  return db.transaction(() => {
    // The link is the authority and carries the proof. An archived link matches nothing, so a
    // withdrawn coach loses the write on the very next request.
    const link = stmt(
      `SELECT id, client_id FROM coach_clients
        WHERE id = ? AND coach_id = ? AND status = 'active'`,
    ).get(linkId, coachId);
    if (!link) throw Object.assign(new Error('no such link'), { code: 'NOT_FOUND' });

    current = 'validate ids';
    if (equipmentIds.length) {
      const placeholders = equipmentIds.map(() => '?').join(',');
      const found = stmt(`SELECT id FROM equipment WHERE id IN (${placeholders})`).all(...equipmentIds);
      if (found.length !== equipmentIds.length) {
        throw Object.assign(new Error('unknown equipment id'), { code: 'BAD_REQUEST' });
      }
    }

    current = 'replace set';
    stmt('DELETE FROM onboarding_equipment WHERE user_id = ?').run(link.client_id);
    const insert = stmt('INSERT INTO onboarding_equipment (user_id, equipment_id) VALUES (?, ?)');
    for (const id of equipmentIds) insert.run(link.client_id, id);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'coach.client.equipment.set', 'user', ?, ?, ?, ?)`,
    ).run(
      coachId, link.client_id,
      // Read back off the stored rows. A detail rebuilt from the argument would say what was
      // asked for; this says what is there.
      JSON.stringify({
        linkId,
        equipment: stmt(
          `SELECT e.id, e.slug FROM onboarding_equipment oe
             JOIN equipment e ON e.id = oe.equipment_id
            WHERE oe.user_id = ? ORDER BY e.sort_order`,
        ).all(link.client_id),
      }),
      requestId, ip,
    );

    current = 'INSERT notification';
    stmt(
      `INSERT INTO notifications (user_id, coach_client_id, type, title, body, link_path)
       VALUES (?, ?, 'profile.equipment_changed', ?, ?, '/settings')`,
    ).run(link.client_id, linkId, 'Felszerelés frissítve', 'Az edződ módosította az eszközeidet.');

    current = 'read back';
    const { c } = stmt('SELECT COUNT(*) AS c FROM onboarding_equipment WHERE user_id = ?').get(link.client_id);
    return { clientId: link.client_id, count: c };
  })();
}
```

> The notification's title and body are stored Hungarian, matching how the other seeded notifications in this table are written. If notification i18n lands later it is a migration over this column, not a change here.

- [ ] **Step 4: Export it from the facade**

In `backend/src/db/index.js`, with the other named delegations. The audit gate reads this file to learn which facade call runs which transaction, so the `name` must match exactly.

```js
export const setClientEquipment = (args) => pool.run(args, { name: 'setClientEquipmentTx' });
```

- [ ] **Step 5: Write the route**

In `backend/src/onboarding/routes.js`, under the existing `/* ── the coach's view ── */` heading, beside `GET /clients/:id/onboarding`.

```js
const CoachEquipmentBody = z
  .object({ equipment: z.array(z.number().int().positive()).max(64) })
  .strict();

router.patch(
  '/clients/:linkId/onboarding/equipment',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const linkId = z.coerce.number().int().positive().parse(req.params.linkId);
    const body = CoachEquipmentBody.parse(req.body);
    try {
      const out = await db.setClientEquipment({
        coachId: req.user.id,
        linkId,
        equipmentIds: [...new Set(body.equipment)],
        requestId: req.id,
        ip: req.ip,
      });
      res.json({ ok: true, count: out.count });
    } catch (err) {
      // 404 for "not yours", "archived" and "never existed" alike — the same story its neighbour
      // tells, so the two routes cannot be used to tell those cases apart.
      if (err?.code === 'NOT_FOUND') return sendError(res, 404, ERR.NOT_FOUND, 'not found');
      if (err?.code === 'BAD_REQUEST') return sendError(res, 400, ERR.VALIDATION, 'unknown equipment id');
      throw err;
    }
  }),
);
```

Check the imports already at the top of this file — `writeLimiter`, `sendError`, `ERR`, `asyncRoute`, `requireCoach` — and add only what is missing.

- [ ] **Step 6: Run the suite and the gates**

```bash
npm --prefix backend run smoke
```
Expected: all six new lines PASS, nothing pre-existing regressed.

```bash
npm --prefix backend run check:routes && npm --prefix backend run check:worker-tx && npm --prefix backend run check:route-tx
```
Expected: all three OK. `check:routes` proves the limiter is on; `check:worker-tx` proves no conditional return commits half a write.

- [ ] **Step 7: Commit**

```bash
git add backend/src/db/worker.js backend/src/db/index.js backend/src/onboarding/routes.js backend/scripts/smoke.js
git commit -m "A coach can correct the equipment list they were only allowed to read"
```

---

### Task 2: The gate learns about coach cross-user writes

**Files:**
- Modify: `backend/scripts/check-admin-audit.mjs`

**Interfaces:**
- Consumes: `parseRoutes` from `scripts/lib/parse-routes.mjs`; the `facadeToTx` map and `txBody(name)` helper already in this file.
- Produces: nothing importable. A gate.

Task 1's audit row is currently a fact about today held up by whoever remembered — the exact condition the header of this file argues against. This closes it.

- [ ] **Step 1: Read what the gate already does**

```bash
sed -n '1,140p' backend/scripts/check-admin-audit.mjs
```

Note three things you are about to reuse: `parseRoutes(ROOT)` gives `{ routes, suspects }`; `facadeToTx` maps a facade export name to its worker transaction name; `txBody(name)` returns the brace-matched body of that transaction. The existing admin rule asserts the body contains an `INSERT INTO audit_log` with a distinct action string.

- [ ] **Step 2: Add the coach rule beside the admin one**

A cross-user write is a route behind `requireCoach` whose transaction writes a row keyed on a user other than the actor. Rather than infer that, name them — the same shape as the file's existing `UNAUDITED_BY_DESIGN` allowlist, and for the same stated reason: an entry is a line somebody writes and defends.

```js
/**
 * Coach routes that write a row belonging to the CLIENT rather than to the coach.
 *
 * `check-admin-audit`'s argument is about privilege, not about the word "admin": a write one user
 * makes to another user's row is unattributable the moment nobody logs it, and the failure is
 * silent in exactly the same way. A coach route added here without an audit row fails this gate.
 *
 * Add a route when it starts writing client-owned rows. Removing one to make the gate pass is the
 * thing this list exists to make visible.
 */
const COACH_CROSS_USER_WRITES = new Set([
  'PATCH /clients/:linkId/onboarding/equipment',
]);

for (const r of routes) {
  // `key` is built by the parser as `${method} ${route}` — use it rather than rebuilding it, so
  // this gate and check-routes can never disagree about what a route is called.
  if (!COACH_CROSS_USER_WRITES.has(r.key)) continue;

  // The parser exposes no list of facade calls, only the comment-free handler source. Find the
  // facade name in it; `facadeToTx` is the authority on which names are named transactions.
  const facade = [...facadeToTx.keys()].find((name) => new RegExp(`\\b${name}\\s*\\(`).test(r.handler));
  if (!facade) {
    problems.push(`${r.file}:${r.line} — ${r.key} writes client-owned rows but calls no named transaction; it cannot be audited under the write lock`);
    continue;
  }
  const body = txBody(facadeToTx.get(facade));
  if (!body) {
    problems.push(`${r.file}:${r.line} — ${r.key} delegates to ${facadeToTx.get(facade)}, which this gate cannot read`);
  } else if (!/INSERT INTO audit_log/.test(body)) {
    problems.push(`${r.file}:${r.line} — ${r.key} writes another user's rows without an audit_log row`);
  }
}
```

The parser returns `{ file, line, key, method, route, chain, handler, rawChain, rawHandler, via }` — verified against `scripts/lib/parse-routes.mjs:266`. Read the admin loop directly above and reuse its facade-lookup expression verbatim if it already has one: two spellings of the same lookup is the drift this file's own header warns about.

- [ ] **Step 3: Prove the gate passes on the real route**

```bash
npm --prefix backend run check:admin-audit
```
Expected: OK, and the run reports the coach route as checked.

- [ ] **Step 4: Prove the gate actually bites**

Temporarily comment out the `INSERT INTO audit_log` block inside `setClientEquipmentTx`, then:

```bash
npm --prefix backend run check:admin-audit
```
Expected: FAIL naming `PATCH /clients/:linkId/onboarding/equipment`. **Restore the block and re-run to confirm OK.** A gate never tested against a failure is a gate nobody knows is wired up.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/check-admin-audit.mjs
git commit -m "The audit rule was about privilege, not about the word admin"
```

---

### Task 3: The client's own door — Settings → Felszerelés

**Files:**
- Create: `frontend/src/ui/primitives/Toggle.tsx`
- Modify: `frontend/src/features/onboarding/OnboardingPage.tsx`
- Create: `frontend/src/features/settings/EquipmentSection.tsx`
- Modify: `frontend/src/features/settings/SettingsPage.tsx`
- Modify: `frontend/src/i18n/hu.json`, `en.json`, `de.json`
- Modify: `docs/brain/55-Screens/settings.md`

**Interfaces:**
- Consumes: `GET /onboarding` → `{ profile, options: { equipment: {id,name}[] } }`; `PATCH /onboarding` with `{ equipment: number[] }`. Both exist and are unchanged.
- Produces: `<Toggle on label onToggle />` in `src/ui/primitives/`; `<EquipmentSection />`.

- [ ] **Step 1: Promote `Toggle` out of OnboardingPage**

It is defined locally in `OnboardingPage.tsx` and a second screen now needs it. `SettingsPage.tsx:56` already records this exact situation for `SectionBadge` — do not create the second copy that note is about.

```bash
grep -n "function Toggle" frontend/src/features/onboarding/OnboardingPage.tsx
```

Move that function verbatim into `frontend/src/ui/primitives/Toggle.tsx`, export it, and import it back in `OnboardingPage.tsx`. Change no markup and no class names: this step must be behaviour-neutral.

- [ ] **Step 2: Prove the move changed nothing**

```bash
npm --prefix frontend run check:tokens && npm --prefix frontend run check:elements
```
Expected: both OK. `check:tokens` is what proves the control still composes `Pressable` correctly from its new home.

- [ ] **Step 3: Add the three strings, in all three languages**

`hu.json`:
```json
"settings": { "equipment": "Felszerelés", "equipmentHint": "Amit el tudsz érni. Az edzésterved ehhez igazodik.", "equipmentSaved": "Felszerelés mentve" }
```
`en.json`:
```json
"settings": { "equipment": "Equipment", "equipmentHint": "What you can actually reach. Your plan is built around it.", "equipmentSaved": "Equipment saved" }
```
`de.json`:
```json
"settings": { "equipment": "Ausrüstung", "equipmentHint": "Was du tatsächlich erreichen kannst. Dein Plan richtet sich danach.", "equipmentSaved": "Ausrüstung gespeichert" }
```

Merge into the existing `settings` object in each file; do not add a second one.

- [ ] **Step 4: Write the section**

`frontend/src/features/settings/EquipmentSection.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Toggle } from '../../ui/primitives/Toggle';
import { Pressable } from '../../ui/primitives/Pressable';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useToast } from '../../ui/feedback/ToastHost';
import { useOnboarding, useSaveOnboarding } from '../onboarding/useOnboarding';

/**
 * The client's own equipment list, after onboarding.
 *
 * The route `/onboarding` was always live and unguarded once complete, and `PATCH /onboarding`
 * always took `equipment`. What was missing was a door, so the answer given once on step three
 * could never be revised. Same endpoint, same control, reachable.
 */
export function EquipmentSection() {
  const { t } = useTranslation();
  const { data, isPending } = useOnboarding();
  const save = useSaveOnboarding();
  const { toast } = useToast();
  const [draft, setDraft] = useState<number[] | null>(null);

  if (isPending) return <Skeleton className="h-28 w-full rounded-card" />;

  const options = data?.options?.equipment ?? [];
  const current = draft ?? data?.profile?.equipment ?? [];
  const dirty = draft !== null;

  const toggle = (id: number) =>
    setDraft(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);

  return (
    <div className="flex flex-col gap-group">
      <p className="text-body-s text-text-2">{t('settings.equipmentHint')}</p>
      <div className="flex flex-wrap gap-tight">
        {options.map((eq) => (
          <Toggle key={eq.id} on={current.includes(eq.id)} label={eq.name} onToggle={() => toggle(eq.id)} />
        ))}
      </div>
      <Pressable
        variant="primary"
        disabled={!dirty}
        busy={save.isPending}
        onClick={async () => {
          await save.mutateAsync({ equipment: current });
          setDraft(null);
          toast(t('settings.equipmentSaved'));
        }}
      >
        {t('common.save')}
      </Pressable>
    </div>
  );
}
```

Open `frontend/src/features/onboarding/useOnboarding.ts` first and use the hook names it actually exports; if the save hook is named differently, use that name here and nowhere invent one.

- [ ] **Step 5: Mount it as the seventh section**

In `SettingsPage.tsx`, after the language section and before the admin one — it belongs with the personal settings, not after the role-gated block. Import `Wrench` from `lucide-react`, matching the glyph onboarding already uses for equipment.

```tsx
<section className="flex flex-col gap-group">
  <SectionHeader icon={Wrench} title={t('settings.equipment')} />
  <EquipmentSection />
</section>
```

- [ ] **Step 6: Verify it in the browser**

```bash
npm --prefix backend start
```
Then start the frontend preview and sign in as `user@tracker.local` / `TrackerDev123`. Open Settings, untick one item, save, reload, and confirm the change survived. Then:

```bash
npm --prefix frontend run build
```
Expected: PASS. This is the run that proves `check:i18n` is satisfied in all three languages.

- [ ] **Step 7: Update the screen spec, then commit**

Add the section to `docs/brain/55-Screens/settings.md` — the block list and the states. It is now seven sections, not six.

```bash
git add frontend/src/ui/primitives/Toggle.tsx frontend/src/features/onboarding/OnboardingPage.tsx frontend/src/features/settings/ frontend/src/i18n/ docs/brain/55-Screens/settings.md
git commit -m "The answer given on step three could never be revised"
```

---

### Task 4: The coach's editor on client detail

**Files:**
- Create: `frontend/src/features/coaching/ClientEquipmentCard.tsx`
- Modify: `frontend/src/features/coaching/useCoaching.ts`
- Modify: `frontend/src/features/coaching/ClientDetailPage.tsx`
- Modify: `frontend/src/i18n/hu.json`, `en.json`, `de.json`
- Modify: `docs/brain/55-Screens/coach-client-detail.md`

**Interfaces:**
- Consumes: Task 1's `PATCH /clients/:linkId/onboarding/equipment`; `useClientOnboarding(linkId)` → `{ profile: { equipment: {id,slug,name}[] } }`, already in `useCoaching.ts:92`.
- Produces: `useSetClientEquipment()` mutation; `<ClientEquipmentCard linkId />`.

- [ ] **Step 1: Add the mutation hook**

In `useCoaching.ts`, beside `useClientOnboarding`. Invalidate the onboarding query for this link so the card re-reads what the server stored rather than trusting the local draft.

```ts
export function useSetClientEquipment(linkId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (equipment: number[]) =>
      apiWithRefresh(`/clients/${linkId}/onboarding/equipment`, {
        method: 'PATCH',
        body: { equipment },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'client', linkId, 'onboarding'] }),
  });
}
```

Match `apiWithRefresh`'s actual call signature as used elsewhere in this file — some wrappers take the body pre-stringified.

- [ ] **Step 2: The card needs the equipment options list**

`GET /clients/:id/onboarding` returns the client's chosen equipment as objects, but not the full taxonomy to choose from. The client's own `GET /onboarding` returns `options.equipment`, and a coach calling it would get **their own** profile. Reuse `useTaxonomies` from `features/library/useExercises.ts`, which already serves the equipment taxonomy to the library screen — no new endpoint.

```bash
grep -n "useTaxonomies" -A 12 frontend/src/features/library/useExercises.ts
```

Confirm it exposes equipment as `{ id, slug, name }[]` and use it. If it does not, stop and report — do not add a fourth way to fetch the same taxonomy.

- [ ] **Step 3: Write the card**

`ClientEquipmentCard.tsx`, same shape as `EquipmentSection` with two differences: it writes through Task 1's route, and it says out loud that the client will be told.

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Toggle } from '../../ui/primitives/Toggle';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { useToast } from '../../ui/feedback/ToastHost';
import { useTaxonomies } from '../library/useExercises';
import { useClientOnboarding, useSetClientEquipment } from './useCoaching';

export function ClientEquipmentCard({ linkId }: { linkId: number }) {
  const { t } = useTranslation();
  const onboarding = useClientOnboarding(linkId);
  const taxonomies = useTaxonomies();
  const save = useSetClientEquipment(linkId);
  const { toast } = useToast();
  const [draft, setDraft] = useState<number[] | null>(null);

  const options = taxonomies.data?.equipment ?? [];
  const stored = (onboarding.data?.profile?.equipment ?? []).map((e) => e.id);
  const current = draft ?? stored;

  const toggle = (id: number) =>
    setDraft(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);

  return (
    <Surface className="flex flex-col gap-group">
      <p className="text-body-s text-text-2">{t('coaching.equipmentHint')}</p>
      <div className="flex flex-wrap gap-tight">
        {options.map((eq) => (
          <Toggle key={eq.id} on={current.includes(eq.id)} label={eq.name} onToggle={() => toggle(eq.id)} />
        ))}
      </div>
      <Pressable
        variant="primary"
        disabled={draft === null}
        busy={save.isPending}
        onClick={async () => {
          await save.mutateAsync(current);
          setDraft(null);
          toast(t('coaching.equipmentSaved'));
        }}
      >
        {t('common.save')}
      </Pressable>
    </Surface>
  );
}
```

- [ ] **Step 4: Strings, all three languages**

The hint must state the consequence, because the coach is editing somebody else's answer:

- `hu`: `"equipmentHint": "A kliens elérhető eszközei. A módosításról értesítést kap."` / `"equipmentSaved": "Felszerelés mentve"`
- `en`: `"equipmentHint": "The kit this client can reach. They are notified when you change it."` / `"equipmentSaved": "Equipment saved"`
- `de`: `"equipmentHint": "Die Ausrüstung, die dieser Klient erreichen kann. Er wird über Änderungen benachrichtigt."` / `"equipmentSaved": "Ausrüstung gespeichert"`

- [ ] **Step 5: Mount it**

In `ClientDetailPage.tsx`, in the questionnaire area under the profile summary (around the `onboarding.isPending` block at line 332). Read the note at line 140 first — the eleven-row table was removed on purpose and equipment was one of its rows. This card is that row coming back as an editor, not the table coming back.

- [ ] **Step 6: Verify end to end**

Sign in as `coach@tracker.local`, open a client, change their equipment, save. Then sign in as that client and confirm **both**: the list changed in Settings, and a notification arrived. Then:

```bash
npm --prefix frontend run build && npm --prefix backend run check:all
```
Expected: both PASS.

- [ ] **Step 7: Update the screen spec, then commit**

```bash
git add frontend/src/features/coaching/ frontend/src/i18n/ docs/brain/55-Screens/coach-client-detail.md
git commit -m "The row that came back as an editor"
```

---

## Done when

- A client can change their equipment from Settings and the change survives a reload.
- A coach can change a client's equipment; an `audit_log` row records it with the stored state, and the client gets a notification.
- Another coach gets 404; a member gets 403.
- `npm run smoke`, `npm run check:all` and `npm --prefix frontend run build` all pass.
- `check:admin-audit` fails if the audit row is removed — verified by hand in Task 2, Step 4.

## Not in this plan

Filtering (`only_available`, `hide_conflicts`, multi-valued `equipment`, the shared picker) is plan B. The builder and the visual pass are plan C. Location-based equipment profiles are out of scope per [[0013-coach-writes-client-equipment]].
