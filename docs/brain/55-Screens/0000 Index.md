---
type: screen-index
title: Screens — index
updated: 2026-08-23
tags: [ux, screen, redesign, index]
---

# Screens — index

One note per screen, specifying what it should look like after the liquid-glass redesign. These are
**specifications, not reports**: they were written from the approved mockups and the live code
before any implementation, and the implementer works from them.

> [!important] This index is hand-written, and that is deliberate
> `.obsidian/` carries no community plugins, so the Dataview blocks in [[00-Index/Home]] and
> [[60-Decisions/0000 Index]] render as inert code fences. A query here would join them.
> The guard against this list going stale is a build gate, not a plugin — see *Keeping it honest*.

> [!warning] These notes carry no design values
> No hex, no pixels, no durations, no font sizes. Those live in
> `frontend/src/ui/tokens/tokens.css`, and `frontend/DESIGN.md` records why each one is what it is.
> A value written in two places is the ninth thing that can disagree — the exact defect
> [[60-Decisions/0000 Index]] was rewritten to prevent. Numbers that DO appear here are the
> product's own content (`1840 / 2500`, `82,4 kg`), which is data, not design.

## Member

| Screen | Route | Anchor |
|---|---|---|
| [[home\|Kezdőlap]] | `/` | Weekly progress ring with the week strip inside it |
| [[home-empty\|Kezdőlap — üres]] | `/` | Oversized calendar glyph in a tinted circle |
| [[workout-player\|Edzés]] | `/workout` | The anatomical muscle map |
| [[workout-states\|Edzés — állapotok]] | `/workout` | The same map; the note covers the five set states |
| [[nutrition\|Táplálkozás]] | `/nutrition` | Calorie ring |
| [[library\|Gyakorlatok]] | `/library` | The muscle map as a filter |
| [[gyakorlat-reszletei\|Gyakorlat részletei]] | `/library/:id` | Media hero, then the map |
| [[haladas\|Haladás]] | `/progress` | Trend chart |
| [[coins\|Érmék]] | `/coins` | Coin balance gauge |
| [[notifications\|Értesítések]] | `/notifications` | Bell glyph in a tinted circle |
| [[settings\|Beállítások]] | `/settings` | Account avatar with a status ring |
| [[onboarding\|Bevezetés]] | `/onboarding` | Step gauge |

## Coach

| Screen | Route | Anchor |
|---|---|---|
| [[coach-dashboard\|Klienseim]] | `/coach` | Client donut |
| [[coach-client-detail\|Kliens adatlap]] | `/coach/clients/:id` | Client avatar with a status ring |
| [[coach-chat\|Üzenetek]] | `/coach/clients/:id` → chat tab | Client avatar |
| [[coach-plans\|Edzéstervek]] | `/coach/plans` | Stacked-segment bar |
| [[coach-plan-editor\|Tervszerkesztő]] | `/coach/plans/:id` | Week-cycle strip |
| [[piacteri-pult\|Piactéri pult]] | `/compose` | Post donut |
| [[compose-profile\|Profil szerkesztése]] | `/compose/profile` | Profile avatar |
| [[compose-post-editor\|Bejegyzés szerkesztése]] | `/compose/posts/:publicId` | The cover photograph |

## Admin

| Screen | Route | Anchor |
|---|---|---|
| [[admin-attekintes\|Áttekintés]] | `/admin` | Donut over the three counts |
| [[admin-elem-stilus-studio\|Elem-stílus stúdió]] | `/admin/styles` | Live preview stage |

## Public — no bottom bar

These render outside `AppLayout` by deliberate design (`router.tsx:84-100`), so they carry a back
arrow and a `Belépés` button instead of the navigation bar, and the aurora backdrop has to be
mounted per page rather than inherited.

| Screen | Route | Anchor |
|---|---|---|
| [[piacter\|Piactér]] | `/m` | Gym hero photograph |
| [[edzoi-profil\|Edzői profil]] | `/m/c/:handle` | Coach portrait with a status ring |
| [[marketplace-post-detail\|Bejegyzés részletei]] | `/m/p/:publicId` | Post hero photograph |
| [[login\|Belépés]] | `/login` | Dumbbell glyph in a tinted circle |
| [[register\|Regisztráció]] | `/register` | Tinted circle, step one of the account flow |

## What every note contains

**Anchor** — the one large visual element in the top third, and why that one rather than another.
A ring for a countable goal with a known denominator, a chart for a trend, the body map for
anatomy, an avatar for a person.

**Blocks** — top to bottom in render order, with the real Hungarian labels quoted.

**What was merged away, and why** — the section that earns the note its keep. The previous design
was rejected with *"the whole UI is data fields"*, so every note records what was cut and what the
cut bought. A future reader will disagree with some of these; the reasoning is there to be argued
with rather than guessed at.

**States** — empty, loading, error, offline, and any role-gated state.

**Components** — which existing pieces are reshaped, and what is genuinely new.

**Navigation** — the active tab and the tab count for the screen's role.

## Keeping it honest

Two screens share a route (`home` / `home-empty`, `workout-player` / `workout-states`) — those are
one route in two states, not two destinations, which is why the count here is 27 against 23 routes.

A hand-maintained list goes stale, and that is precisely the failure
[[60-Decisions/0000 Index]] documents: eleven decisions went invisible from their own index because
it filtered on a `type` string instead of on folder membership. The planned guard is
`frontend/scripts/check-brain-screens.mjs` in the build chain, asserting that every note here is
linked from this index, every `route` exists in `src/app/router.tsx`, and the count matches. Until
that gate exists, this list is a promise rather than a fact.

## Related

[[00-Index/Home]] · [[50-UX-Concepts/UX Base Pack]] · [[50-UX-Concepts/Muscle Map]] · [[00-Index/TODO Master]]
