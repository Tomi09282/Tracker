---
type: api-index
title: API surface
count: 88
tags: [api, moc, generated]
---

# API surface — 88 endpoints

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-06.

Guards are read from the middleware actually mounted on each route, so this cannot claim a
protection the code does not have.

| Method | Path | Guards |
|---|---|---|
| GET | `/api/v1/admin/moderation` | `requireAuth` |
| POST | `/api/v1/admin/moderation/:id` | `requireAuth` |
| GET | `/api/v1/admin/stats` | `requireAuth` |
| POST | `/api/v1/admin/users/:id/role` | `requireAuth` |
| POST | `/api/v1/auth/change-credentials` | `requireAuth` |
| POST | `/api/v1/auth/login` | — |
| POST | `/api/v1/auth/logout` | — |
| POST | `/api/v1/auth/logout-all` | `requireAuth` |
| GET | `/api/v1/auth/me` | `requireAuth` |
| POST | `/api/v1/auth/refresh` | — |
| POST | `/api/v1/auth/register` | — |
| GET | `/api/v1/calendar-feeds` | `requireAuth` |
| POST | `/api/v1/calendar-feeds` | `requireAuth` |
| POST | `/api/v1/calendar-feeds/:id/revoke` | `requireAuth` |
| GET | `/api/v1/calendar/:token.ics` | — |
| GET | `/api/v1/clients` | `requireAuth`, `requireCoach` |
| GET | `/api/v1/clients/:id` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/clients/:id/archive` | `requireAuth`, `requireCoach` |
| GET | `/api/v1/clients/:id/onboarding` | `requireAuth`, `requireCoach` |
| GET | `/api/v1/clients/:id/records` | `requireAuth` |
| GET | `/api/v1/clients/:id/workouts` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/clients/pregenerate` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/coaches/:linkId/leave` | `requireAuth` |
| GET | `/api/v1/conversations` | `requireAuth` |
| POST | `/api/v1/conversations` | `requireAuth` |
| POST | `/api/v1/conversations/:id/block` | `requireAuth` |
| GET | `/api/v1/conversations/:id/messages` | `requireAuth` |
| POST | `/api/v1/conversations/:id/messages` | `requireAuth` |
| POST | `/api/v1/conversations/:id/read` | `requireAuth` |
| POST | `/api/v1/conversations/:id/unblock` | `requireAuth` |
| GET | `/api/v1/exercises` | `requireAuth` |
| POST | `/api/v1/exercises` | `requireAuth` |
| DELETE | `/api/v1/exercises/:id` | `requireAuth` |
| GET | `/api/v1/exercises/:id` | `requireAuth` |
| PATCH | `/api/v1/exercises/:id` | `requireAuth` |
| POST | `/api/v1/exercises/:id/media` | `requireAuth`, `multipartCsrf`, `multerMiddleware` |
| POST | `/api/v1/exercises/:id/submit` | `requireAuth` |
| GET | `/api/v1/invite-codes` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/invite-codes` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/invite-codes/:id/revoke` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/join` | `requireAuth` |
| GET | `/api/v1/languages` | — |
| GET | `/api/v1/me/theme` | `requireAuth` |
| PUT | `/api/v1/me/theme` | `requireAuth` |
| DELETE | `/api/v1/media/:id` | `requireAuth` |
| GET | `/api/v1/media/:key` | `requireAuth` |
| DELETE | `/api/v1/messages/:id` | `requireAuth` |
| POST | `/api/v1/messages/:id/report` | `requireAuth` |
| GET | `/api/v1/my-plans` | `requireAuth` |
| GET | `/api/v1/my-plans/today` | `requireAuth` |
| GET | `/api/v1/my-plans/week` | `requireAuth` |
| GET | `/api/v1/onboarding` | `requireAuth` |
| PATCH | `/api/v1/onboarding` | `requireAuth` |
| POST | `/api/v1/onboarding/complete` | `requireAuth` |
| GET | `/api/v1/plans` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/plans` | `requireAuth`, `requireCoach` |
| DELETE | `/api/v1/plans/:id` | `requireAuth`, `requireCoach` |
| GET | `/api/v1/plans/:id` | `requireAuth`, `requireCoach` |
| PATCH | `/api/v1/plans/:id` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/plans/:id/blocks` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/plans/:id/clone` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/plans/:id/copy-days` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/plans/:id/days` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/plans/:id/exercises` | `requireAuth`, `requireCoach` |
| DELETE | `/api/v1/plans/:planId/blocks/:blockId` | `requireAuth`, `requireCoach` |
| PATCH | `/api/v1/plans/:planId/blocks/:blockId` | `requireAuth`, `requireCoach` |
| PUT | `/api/v1/plans/:planId/blocks/order` | `requireAuth`, `requireCoach` |
| DELETE | `/api/v1/plans/:planId/days/:dayId` | `requireAuth`, `requireCoach` |
| PATCH | `/api/v1/plans/:planId/days/:dayId` | `requireAuth`, `requireCoach` |
| DELETE | `/api/v1/plans/:planId/exercises/:rowId` | `requireAuth`, `requireCoach` |
| PATCH | `/api/v1/plans/:planId/exercises/:rowId` | `requireAuth`, `requireCoach` |
| PUT | `/api/v1/plans/:planId/exercises/order` | `requireAuth`, `requireCoach` |
| GET | `/api/v1/progress` | `requireAuth` |
| GET | `/api/v1/records` | `requireAuth` |
| POST | `/api/v1/sets/:id/check` | `requireAuth` |
| POST | `/api/v1/sets/:id/void` | `requireAuth` |
| GET | `/api/v1/sources` | — |
| GET | `/api/v1/taxonomies` | `requireAuth` |
| GET | `/api/v1/teams` | `requireAuth`, `requireCoach` |
| POST | `/api/v1/teams` | `requireAuth`, `requireCoach` |
| GET | `/api/v1/ui/element-styles` | — |
| PUT | `/api/v1/ui/element-styles/:id` | `requireAuth` |
| GET | `/api/v1/workouts` | `requireAuth` |
| POST | `/api/v1/workouts/:id/abandon` | `requireAuth` |
| POST | `/api/v1/workouts/:id/finish` | `requireAuth` |
| GET | `/api/v1/workouts/current` | `requireAuth` |
| GET | `/api/v1/workouts/current/previous` | `requireAuth` |
| POST | `/api/v1/workouts/start` | `requireAuth` |

## Invariants that apply to every endpoint

- Error envelope `{error, code, requestId}`; codes come from `ERR` in `src/lib/http.js`.
- Bodies, params and query strings validated with `.strict()` zod schemas before use.
- Client-owned rows: ownership re-validated on every read AND write; a miss is **404, never 403**.
- Lists: whitelisted sort keys, keyset cursors, page size capped server-side.
- Health and config are the only routes above the CSRF middleware, and both are GET-only.
