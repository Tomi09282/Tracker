# Phase 2 — spec

Author: Claude Opus 5 (solo pipeline, D-P1) · Date: 2026-08-04
Entry: Phase 1 is code-complete (41/51); the ten open items are owner decisions, recorded
limitations, or audits blocked on the preview pane (OQ-5) — none of them block Phase 2.

Scope: **F2** coach↔client links, teams, three join flows, referrals · **F11** onboarding ·
**F3** workout plans, the guided player, logging, PRs and progress.

Owner requirements covered: 3 (coach manages clients), 4 (daily plans), 18 (pre-generated
accounts AND team codes).

---

## What already exists and must not be rebuilt

Auth with roles and a `session_version` kill-switch · the visibility/anti-IDOR pattern (404 not
403) · keyset pagination and `makeList`-style whitelisting · the media pipeline · the token layer
and the 44px control primitive · all 100 feedback variants (E21 and E22 are **catalogued and
DB-seeded but not implemented** — this phase implements them) · the multi-language content model,
which plans and exercises both inherit.

---

## Job slicing

Sequential; they share contracts. Each carries its budget line (inputs ≤ 120k, work ≤ 120k,
reserve 60k of a 300k window). No job starts without one.

| Job | Goal | Writes | Budget (in / work / reserve) |
|---|---|---|---|
| **J1** | Migration 006: `coach_clients`, `teams`, `invite_codes`, `referrals` + the three join flows | migration, `src/coaching/` | 40k / 75k / 185k |
| **J2** | Coach dashboard + client detail shell (blueprints 6 and 7) | `src/features/coaching/` | 45k / 85k / 170k |
| **J3** | Migration 007 + onboarding questionnaire (F11) | migration, `src/onboarding/`, `src/features/onboarding/` | 35k / 65k / 200k |
| **J4** | Migration 008: plans, days, items, logs, log sets + authoring API | migration, `src/plans/` | 50k / 95k / 155k |
| **J5** | Plan authoring UI: week view, drag-reorder, templates, clone | `src/features/plans/` | 50k / 95k / 155k |
| **J6** | Guided workout player + E21 set rows + E22 rest timer (blueprint 3) | `src/features/player/`, E21/E22 variants | 55k / 100k / 145k |
| **J7** | PRs, 1RM (Epley), per-exercise graphs, ICS export | `src/progress/`, `src/features/progress/` | 45k / 80k / 175k |

---

## Design intelligence (SO-4)

Required before J2 and before J7:
- `--design-system "coach client management fitness dashboard"` for the dashboard area
- `--domain ux "forms multi-step drag reorder timer"` for the interactions built here
- `--domain chart "trend comparison progress"` before any graph ships in J7

Cite the chosen IDs here when run. The Bible still outranks every recommendation.

---

## Schema

**006 — coaching**
- `coach_clients` (coach_id, client_id, status invited|active|archived, team_id, created_at) with
  a UNIQUE on (coach_id, client_id) and a composite index on (coach_id, status)
- `teams` (coach-owned; name, description, archived_at)
- `invite_codes` (code, kind single|multi, max_uses, uses, expires_at, team_id, coach_id,
  revoked_at) — the code column carries a UNIQUE index
- `referrals` (coach_id, referred_user_id, awarded_at)

**007 — onboarding**
- `onboarding_profiles` (user_id PK, goals JSON, injuries TEXT, units enum, experience enum,
  equipment JSON, completed_at)

**008 — plans and logs**
- `workout_plans` (owner_id, client_id nullable, is_template, name, notes)
- `workout_plan_days` (plan_id, day_index, name)
- `workout_plan_items` (day_id, exercise_id, order_index, sets, reps, time_seconds, rpe,
  rest_seconds, superset_group)
- `workout_logs` (user_id, plan_day_id nullable, started_at, finished_at)
- `workout_log_sets` (log_id, exercise_id, set_index, weight_grams, reps, completed_at, is_pr)

Weight is stored in **grams as an integer**. Floating-point kilos accumulate error across a
year of logs and make "is this a PR" a question about rounding.

---

## The three join flows (owner requirement 18)

| Flow | How it works | The security question it must answer |
|---|---|---|
| A — invite link | Coach generates a token; the client opens it and accepts | The token must be unguessable and single-use unless declared multi |
| B — team code | The client self-registers with a code and lands in the coach's team | The code space must resist brute force: rate-limited per IP AND per code |
| C — pre-generated account | The coach bulk-creates credentialled accounts with a temporary password | The client MUST be forced to change credentials on first login, or the coach retains access to their account forever |

Codes are CSPRNG, ≥128 bits encoded, compared in constant time, and every redemption is audited.

---

## Acceptance criteria

1. A coach sees only their own clients; another coach's client id returns 404.
2. An archived link loses access immediately — no stale token grants.
3. A team id belonging to another coach cannot be used to reach their clients.
4. A pre-generated account cannot be used until its credentials are changed.
5. Codes: expiry, `max_uses` and revocation all enforced inside the UPDATE, not before it.
6. Plan authoring is owner-scoped on every read and write.
7. A replayed set-completion does not double-count a PR.
8. The workout player's page does not scroll while checking sets — only the set list does.
9. E21 and E22 ship with all five variants each and are switchable at runtime.
10. Weights round-trip exactly: what was entered is what is displayed.
11. Smoke extended with every new endpoint plus an abuse case per route.
12. `npm audit` 0 high/critical; build and token gate green.

---

## Verification

`npm run build` · `npm run smoke` + `npm run smoke:limits` · `npm audit` · DOM measurement at
360 and 1440 · `npm run brain:gen` then `brain-sync.mjs` after each job, per the sync discipline
the owner set — not at the end of the phase.
