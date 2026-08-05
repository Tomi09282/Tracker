# Phase 1 — spec

Author: Claude Opus 5 (solo pipeline, D-P1) · Date: 2026-08-04
Entry condition: **Phase 0 complete, 18/18** — token layer, control primitive, build gate,
backend scaffold and auth are all green and measured.

Scope: **F14 remainder** (theme engine + persistence, accent picker, gradient builder, bottom
navbar, feedback catalog E1–E20, UX base pack, i18n) · **F1 exercise library** (seed, custom
CRUD, media, search, muscle map, substitutions) · **F8-lite** (stats endpoint, admin gate,
moderation queue).

What Phase 0 already delivered, so this phase does NOT rebuild it: the 3-layer token
architecture, all five theme packs as static CSS, the type scale, the `Pressable` control
primitive, `check-tokens` as a build gate, the DB worker pool, migrations, and the whole auth
surface.

---

## Job slicing

Jobs run **sequentially** — they share files and contracts, so the default from the agent
decomposition section applies. Each carries its token budget: inputs ≤ 120k, working+output
≤ 120k, reserve 60k, of a 300k window. A job that would exceed its input budget gets split
before it starts, never mid-run.

| Job | Goal | Reads | Writes | Budget (in / work / reserve) |
|---|---|---|---|---|
| **J1** | App shell: router, layout, bottom navbar, API client, i18n, auth screens | tokens.css, control.ts, Pressable, auth routes | `src/app/`, `src/lib/api.ts`, `src/i18n/`, `src/ui/nav/`, `src/features/auth/` | 35k / 60k / 205k |
| **J2** | Theme engine: pre-paint script, persistence, accent picker, gradient builder, contrast guard | tokens.css, J1 shell, migration 002 | `src/ui/theme/`, `src/features/settings/`, migration 002, theme routes | 45k / 80k / 175k |
| **J3** | Feedback catalog A: E1–E10 × 5 variants + registry + playground | control.ts, Pressable, motion tokens | `src/ui/feedback/`, `src/ui/feedback/variants/E1-E10.tsx` | 40k / 90k / 170k |
| **J4** | Feedback catalog B: E11–E20 × 5 variants | J3 registry | `src/ui/feedback/variants/E11-E20.tsx` | 40k / 90k / 170k |
| **J5** | Exercise backend: migration 003, seed pipeline, CRUD, FTS5, media upload | db layer, auth middleware | migration 003, `src/exercises/`, `scripts/seed-exercises.js`, `src/lib/media.js` | 55k / 100k / 145k |
| **J6** | Library UI: list, filters, detail, muscle map SVG, substitutions | J1 shell, J5 contracts | `src/features/library/`, `src/assets/muscle-map/` | 50k / 95k / 155k |
| **J7** | Admin-lite: stats endpoint, moderation queue, admin shell + smoke extensions | J5, auth requireRole | `src/admin/`, `src/features/admin/`, `scripts/smoke.js` | 40k / 70k / 190k |

J3 and J4 are split purely on budget: twenty elements at five variants each is ~100
implementations, which does not fit one run with headroom. They share only the registry
contract, which J3 establishes and J4 consumes.

---

## Design intelligence (SO-4)

Queried before this spec was written; full reasoning and rejections in
[[60-Decisions/0007 Design system inputs and conflict resolution|ADR-0007]].

- Style: **Modern Dark (Cinema Mobile)** — adopted, within the Bible's constraints.
- Typography: **Web3 Bitcoin DeFi (Space Grotesk + Inter + Mono)** — the pairing validates the
  Bible's font choice. The mono third family is NOT adopted (two-family cap).
- UX pass returned four High-severity items, all already Phase 0 gates: reduced-motion,
  44×44 targets, 1–2 animations per view, body contrast.
- A `--domain chart` pass is required before J7 ships stats.

---

## Schema additions

**Migration 002 — theming**

- `user_theme_prefs` (user_id PK/FK, pack, accent, gradient JSON, updated_at). The gradient is
  a genuine non-relational config blob, which is the one case the data-model rules allow JSON.
- `element_style_config` (element_id PK 'E1'…'E26', variant CHECK IN ('A'..'E'), updated_by,
  updated_at) — global, admin-editable, seeded with the curated defaults.

**Migration 003 — exercise library**

- `exercises` (name, name_hu, normalized_name, status CHECK global|private|pending_review|
  rejected, owner_id, source, source_uid, difficulty, exercise_type, description, deleted_at)
- `exercises_fts` — FTS5 external-content shadow kept in sync by three triggers
- `muscle_groups`, `equipment` (lookup tables — admin-editable, hence tables not CHECKs)
- `exercise_muscle_map` (junction + `role` CHECK primary|secondary)
- `exercise_equipment_map` (junction)
- `exercise_media` (exercise_id, kind CHECK image|video, storage_key, mime, width, height,
  position, deleted_at)

Every client-owned row carries `owner_id` with a composite index. No JSON list ever stands in
for a relation.

---

## Endpoint contracts

All under `/api/v1`, all with the `{error, code, requestId}` envelope, all zod `.strict()`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/exercises` | required | cursor pagination, hard cap 24/page, whitelisted sort |
| GET | `/exercises/:id` | required | visibility predicate in SQL; miss ⇒ 404 |
| POST | `/exercises` | coach/admin | creates a private custom exercise |
| PATCH | `/exercises/:id` | owner | explicit pick-list, never a body spread |
| DELETE | `/exercises/:id` | owner | soft delete |
| POST | `/exercises/:id/submit` | owner | private → pending_review |
| POST | `/exercises/:id/media` | owner | multipart; magic-byte sniff, re-encode, EXIF strip |
| DELETE | `/media/:id` | owner | soft delete |
| GET | `/media/:key` | required | visibility-gated serving, `Content-Disposition`, nosniff |
| GET | `/taxonomies` | required | muscle groups + equipment |
| GET | `/sources` | public | CC-BY-SA attribution page data |
| GET | `/ui/element-styles` | public | the active variant per element |
| PUT | `/ui/element-styles/:id` | admin | audited |
| GET/PUT | `/me/theme` | required | user theme prefs |
| GET | `/admin/stats` | admin | DB role re-check inside the handler |
| GET | `/admin/moderation` | admin | pending_review queue |
| POST | `/admin/moderation/:id` | admin | approve/reject, audited |

**Visibility predicate**, hardcoded in SQL on every exercise read:
`status = 'global' OR owner_id = @user`, plus a narrow admin arm for `pending_review` on the
detail and media routes only. An IDOR probe returns **404**, never 403 — a 403 confirms the row
exists.

---

## Acceptance criteria

1. Every screen matches its blueprint (Auth 1, Library 4, Exercise detail 5, Settings 9,
   Admin 10, Empty states 11, Skeletons 12).
2. `check-tokens` passes: no raw values, no hand-rolled controls.
3. Zero interactive elements below 44×44 px, measured in the DOM at 360 px.
4. All five feedback variants exist for E1–E20 and are switchable at runtime.
5. `prefers-reduced-motion` produces an instant state change everywhere, verified.
6. Theme pack switching repaints without a reload and survives a refresh (no FOUC).
7. A user-chosen accent passes the WCAG 4.5:1 guard before it can be saved.
8. Exercise search returns results for a diacritic-insensitive Hungarian query.
9. Uploading a non-image with an image extension is rejected by magic-byte sniffing.
10. EXIF/GPS is stripped from every stored image — asserted on a geotagged fixture.
11. An IDOR probe for another user's private exercise returns 404.
12. Smoke suite extended with every new endpoint, all green.
13. `npm audit`: 0 high/critical.
14. i18n: every user-facing string keyed in HU and EN; `check:i18n` gates the build.

---

## Verification

`npm run build` (frontend, with both gates) · `npm run smoke` + `npm run smoke:limits`
(backend, hermetic) · `npm audit` · DOM measurement at 360 px and 1440 px · Bible line-by-line
audit. Screenshot capture remains blocked (OQ-5) — the owner reviews visually in their own
browser until the pane composites.
