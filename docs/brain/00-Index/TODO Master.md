---
type: todo-master
title: TRACKER — Master TODO map
status: live
updated: 2026-08-04
tags: [index, todo, external-memory]
---

# Master TODO map — external memory

> [!important] EXTERNAL MEMORY LAW
> This note plus [[Home]] is the **first thing read in every new session and after every
> context reset**, before any other action. Task state lives HERE, never in conversation
> memory. If it is not written here, it does not exist.
> Update an item's status **the moment** its state changes — not only at phase approval.

> [!danger] FULL REBUILD — 2026-08-04
> The entire previous implementation was **deleted** by owner decision (20 761 files,
> 611.6 MB, 3 commits). Its design layer failed the VISUAL DESIGN BIBLE on every axis and the
> owner reported misaligned layouts throughout. Nothing from it is running. Only the *knowledge*
> was kept: the ADRs in [[60-Decisions/0000 Index]] and the UX-concept notes are carried over as
> lessons to re-apply and re-verify, not as descriptions of live code.
> See [[60-Decisions/0006 Full rebuild from scratch]].

## Legend

| Status | Meaning |
|---|---|
| `pending` | Not started. |
| `in_progress` | Started, not finished. |
| `done` | Finished AND verified (build + smoke + review + Bible audit). |
| `blocked` | Cannot proceed — blocker named in the note. |

Checkbox `[x]` is set only for `done`. Every item carries a one-line note.

## Where things live

- **Source of truth:** the repo `C:\Users\Petike\Documents\Cursor\tracker` (re-initialized empty
  2026-08-04).
- **Brain (cold store):** `docs/brain/` — mirrored into the Obsidian vault
  `C:\Users\Petike\Documents\GymTracker\GymTracker` by `scripts/brain-sync.mjs`.
  Edit in the repo, never in the vault. *(The vault mirror is what survived the wipe.)*
- **Hot agent memory:** `docs/pipeline/SHARED_MEMORY.md` — read first / write last.
- **Phase artifacts:** `docs/pipeline/phase-N/`.

## Phase status board

**The counts are COMPUTED from the phase files, never typed** — a hand-maintained summary of eight
other documents is a ninth thing that can disagree with them, which is this project's single
recurring defect turned on its own notes. Regenerate with `scratchpad/refresh-master.mjs`.

**The status is part computed and part judged, and the difference is stated rather than hidden.**
`done` and `pending` fall out of the numbers. **`closed` does not**: it means the remaining open
boxes are deliberate carry-forwards rather than unfinished work, and no count can decide that — so
it is declared beside its reason.

| Phase | Scope | Status | Note |
|---|---|---|---|
| **0** | Foundation — repo, env, design system byte-exact to the Bible, backend scaffold | `done` | **18/18.** Design system, build gate, backend and auth all verified |
| [[TODO Phase-1\|1]] | F14 UI foundation + F1 exercise library + F8-lite | `closed` | **57/58** · 1 open. Owner sign-off 2026-08-06. The one open item is T1.31 (gender/body variants + 3D on the muscle map), carried forward as a feature rather than a blocker |
| [[TODO Phase-2\|2]] | F2 coach↔client + teams + join codes + F11 onboarding + F3 plans/logging | `closed` | **65/66** · 1 open. Both halves work end to end. The one open item is T2.3.5 (per-coach seat cap), reserved for the billing phase by design |
| [[TODO Phase-3\|3]] | F5 notifications + F6 chat | `done` | **26/28** · 2 cut/deferred. The two deferred both wait on a scheduler — quiet hours and the weekly digest would each store a promise the delivery path cannot keep, which is worse than no setting at all |
| [[TODO Phase-4\|4]] | F4 nutrition + F10 progress/measurements | `closed` | **24/29** · 3 cut/deferred · 2 open. Two open follow-ups this phase deliberately did NOT take: coach visibility into a client FOOD LOG (needs the same explicit consent design `progress_shares` got — *coaching seems to imply it* is not a reason) and running a larger USDA import (the script works and is exercised; `fdc.nal.usda.gov` is unreachable from this host) |
| [[TODO Phase-5\|5]] | F7 coins + store + F12 gamification | `done` | **32/38** · 6 cut/deferred. The coach template marketplace was CUT to migration 020 by the adversarial review — thirteen of the twenty-one fatal-and-severe findings sat in it, including a FATAL one verified against real code, and deleting it removed thirteen defects without writing a single fix |
| [[TODO Phase-6\|6]] | F15 public marketplace | `in_progress` | **20/31** · 8 cut/deferred · 3 open. Backend complete. Comments, replies, reactions and person-level blocking were CUT: all four FATAL defects and ~15 severe sat there. Two gate items are **blocked** on a frontend that does not exist yet — a Bible audit measures rendered screens, so running one now would produce green ticks about screens nobody has written |
| [[TODO Phase-7\|7]] | F8 full admin + F9 polish (PWA, i18n, GDPR) | `pending` | **0/38** · 38 open. Next. |
| [[TODO Phase-8\|8]] | Later bucket — F13 health sync, payment processor | `pending` | **0/17** · 17 open. White-label parked — do NOT build |

**Across all eight: 224 done · 19 cut or deferred · 62 open.**
Every cut and every deferral carries the reason it is not simply unfinished; three of them were
decided by an adversarial review finding that the severity had piled into one feature, and in each
case deleting that feature removed more defects than fixing them would have.

## Phase 0 — foundation (active)

Rationale: the previous attempt built screens on a token layer that never matched the Bible, so
every screen inherited the error. This time the token layer is finished and **gated** before the
first screen exists.

- [x] **T0.1** Repo skeleton + `git init` + `.gitignore` — `done` · repo, git init, .gitignore, brain restored from the vault mirror
- [x] **T0.2** `docs/pipeline/SHARED_MEMORY.md` with the 5 fixed sections — `done` · docs/pipeline/SHARED_MEMORY.md with all five sections, seeded from Phase 0
- [x] **T0.3** ui-ux-pro-max `--design-system` pass for the product area; cite style/palette/pairing IDs — `done` · design-system + ux + typography passes run; results and rejections in ADR-0007
- [x] **T0.4** Fonts: Space Grotesk (`--font-display`) + Inter (`--font-body`) via `@fontsource`, preloaded, `font-display: swap` — `done` · Space Grotesk + Inter Variable self-hosted via @fontsource, bundled into dist
- [x] **T0.5** Type scale bound exactly to the Bible: Display 34/40/700/-0.02em · Title-1 26/32/700/-0.01em · Title-2 20/26/600 · Title-3 17/24/600 · Body 15/22/400 · Body-S 13/18/400 · Caption 12/16/500 · Micro 11/14/600 uppercase +0.06em — `done` · all 8 steps verified in the DOM: 34/40/700/-0.68px down to 11/14/600/+0.66px
- [x] **T0.6** Midnight palette byte-exact to the Bible, text ramp as **opacity** (92/62/42 %) over the surface token, border `rgba(255,255,255,0.07)` — `done` · all 13 Midnight tokens byte-exact; text ramp is opacity 92/62/42 over #F2F5F7
- [x] **T0.7** Accent 10-step ramp 50–950 + auto `accent-fg` by luminance (≥4.5:1); hover = accent-400, pressed = accent-600, subtle = 10–12 % alpha — `done` · ramp 50-950 interpolated in OKLab from --accent; hover=400, pressed=600
- [x] **T0.8** Semantic colors with all four forms each: solid + subtle-bg 12 % + border 30 % + on-color — `done` · solid + subtle 12% + border 30% + on-color for success/warning/danger/info
- [x] **T0.9** Motion tokens per the Bible: instant 100 / fast 150 / base 250 / slow 400 ms; standard easing `cubic-bezier(0.16, 1, 0.3, 1)`; springs 300–400 stiffness / 17–28 damping — `done` · 100/150/250/400ms + cubic-bezier(0.16, 1, 0.3, 1), all resolving
- [x] **T0.10** Spacing on the 4px grid (1=4 … 12=48); card padding 16–20px; screen padding 16 mobile / 24 desktop; rhythm 24 section / 16 list / 8–12 group — `done` · Tailwind --spacing is the single 4px grid; card padding 16px; screen gutter 16/24
- [x] **T0.11** Radius per theme (cards 16, buttons 12, chips pill) + structural theme variant map (size/radius/shadow/border, not just color); card separation EITHER border OR shadow, never both — `done` · radius per theme; cards separate by border OR shadow, never both
- [x] **T0.12** Theme packs Midnight / Solar / Forest / Neon / Mono filling identical token slots; light theme auto-derived — `done` · Midnight/Solar/Forest/Neon/Mono verified structurally distinct in the DOM
- [x] **T0.13** **44×44 px minimum enforced structurally** — a shared control primitive every interactive element must use; nothing renders below it — `done` · Pressable primitive carries the floor in its base layer; check-tokens rejects a raw <button> outside src/ui; 13 rendered controls measured, zero below 44px, incl. the compact chip
- [x] **T0.14** Icon size tokens; bottom-nav icon **24px**, bar 64px + safe-area, label 11px, max 5; desktop dock 16px above the bottom — `done` · icon 16/20/24 tokens, nav 64px, dock offset 16px
- [x] **T0.15** Automated Bible gate in the build: token compliance + no raw hex/radius/spacing outside the token file + min-target lint — `done` · check-tokens.mjs gates the build; caught a real violation on its first run
- [x] **T0.16** Backend scaffold from webdev-standards: `server.js`, `run-server.js`, Piscina DB worker pool (SQLCipher), env zod boot validation, pino, `/healthz` + `/readyz` — `done` · boots clean; migration 001 applied (user_version 1), /healthz + /readyz 200, uniform envelope with requestId, CSP without unsafe-inline, DB file verified encrypted, all four pragmas confirmed (WAL, NORMAL, busy_timeout 5000, foreign_keys ON), audit_log UPDATE+DELETE blocked at DB level
- [x] **T0.17** Auth from auth-blueprint: jose access JWT 15 min + rotating refresh with family reuse detection, argon2id, CSRF, rate limits — `done` · 27 functional + 5 rate-limit smoke checks green, 0 npm-audit vulnerabilities; covers rotation, reuse detection, sv kill-switch, cookie flags, CSRF triple layer, tampered-JWT rejection, enumeration-resistant login
- [x] **T0.18** Gradient policy: brand moments only, 2–3 stops, same hue family, **never** the blue→purple AI-generic combination — `done` · gradient stays inside the accent hue family; blue-to-purple is impossible

## Pre-flight gates (one-time, project level)

- [x] **PF-1..4** All four mandatory skill files read — `done` · 2026-08-04
- [x] **PF-5** Superpowers installed — `done` · 14 skills, from `obra/superpowers`
- [x] **PF-6** Obsidian vault skill installed — `done` · `kepano/obsidian-skills`
- [x] **PF-7** ui-ux-pro-max FULL install repaired — `done` · dangling symlink stubs replaced
- [x] **PF-8** ui-ux-pro-max search CLI verified — `done`
- [x] **PF-9** Python available — `done` · 3.13.14
- [x] **PF-10** Previous BASE explored and audited before deletion — `done` · findings preserved below
- [x] **PF-11** Master TODO map in the brain — `done` · this note
- [x] **PF-12** Brain synced to the vault — `done` · the mirror is what survived the wipe

## Findings that MUST NOT recur (from the deleted build's audit)

The audited code is gone; its conclusions are law for the rebuild and are encoded as Phase 0
tasks above. Every one was **measured in the running app**, not guessed:

| # | Finding | Prevented by |
|---|---|---|
| F-01 | Neither prescribed font loaded — app rendered in Segoe UI | T0.4 |
| F-02 | Generic Tailwind type ramp; 13/15/17/26/34px did not exist | T0.5 |
| F-03 | Every Midnight color token differed from the Bible | T0.6 |
| F-04 | Brand gradient was the banned blue→purple "AI-generic" combination | T0.18 |
| F-05 | 12+ interactive elements below 44×44px (search field 24px, chips 32px) | T0.13 |
| F-06 | Bottom-nav icons 20px instead of 24px | T0.14 |
| F-07 | Desktop dock 64px above the bottom instead of 16px | T0.14 |
| F-08 | Motion durations/easing diverged from the Bible | T0.9 |
| F-24 | `animate-pulse` ran at an undeclared 2s in nine files since Phase 4, and the canonical `Skeleton` spelled its own 1.2s inline — invisible to five audits because a skeleton is only on screen while data is in flight | T6.6.2 |
| F-09 | Cards used border AND shadow together | T0.11 |
| F-10 | Card padding 24px instead of 16–20px | T0.10 |
| F-11 | No 10-step accent ramp, no derived hover/pressed states | T0.7 |
| F-12 | Semantic colors missing border and on-color variants | T0.8 |
| F-13 | 20 images with no reserved aspect-ratio box | Phase 1 media rules |

What the old build got RIGHT and should be reproduced: no emoji in chrome, no horizontal scroll
at 360px, no pure `#000`, `tabular-nums` on every counter, zero spinners for content loads,
focus ring never removed, global `prefers-reduced-motion` backstop, fully token-derived radii,
4px grid, genuinely structural theming, and a backend that passed 50/50 smoke with 0 npm-audit
vulnerabilities.

## Standing obligations (every phase, never "done")

- [ ] **SO-1** Read [[Home]] + this map first in every session — `in_progress` · permanent
- [ ] **SO-2** Read `docs/pipeline/SHARED_MEMORY.md` before touching anything; write it last — `in_progress` · file exists; discipline is permanent
- [ ] **SO-3** Per-agent context budget 120k in / 120k work / 60k reserve; oversized job → SPLIT — `in_progress`
- [ ] **SO-4** ui-ux-pro-max per phase: one `--design-system`, one `--domain ux`, one `--domain chart` when stats ship — `pending`
- [ ] **SO-5** Security self-review walks the SECURITY STANDARD item by item — `in_progress`
- [ ] **SO-6** Screenshots at 360px AND 1440px, audited line-by-line against the Bible — `resolved-differently` · **the pane still does not composite, and five phase gates shipped anyway.** Every Bible audit since Phase 3 is a live DOM MEASUREMENT: type scale, motion durations, 44px targets, pure-black/white surfaces, horizontal overflow and heading count, read out of the running app. That is evidence rule 2 — *a screenshot is evidence of a frame, a measurement is evidence of a fact* — and where the two disagreed in Phase 2, the measurement won. What a screenshot would still add is composition and hierarchy, which no probe can judge; that half is named as uncovered in every audit rather than claimed
- [ ] **SO-7** Verify gate: build + smoke + `npm audit` 0 high/critical — `in_progress` · all three green as of 2026-08-04
- [ ] **SO-8** Update this map the moment any status changes — `in_progress`
- [ ] **SO-9** No feature creep beyond the current phase — `in_progress`
- [ ] **SO-10** Never touch `.env`/secrets; commit only per the git decision — `in_progress`

## Locked decisions (baked-in defaults — do not re-litigate)

- [x] **D-1A** Coins earn-only first — `done`
- [x] **D-2A** Coaches pay subscription; payment processor LATER, stubs only — `done` · **resolved 2026-08-14: Stripe (Connect + Billing)** — [[60-Decisions/0014-payment-processor|ADR-0014]]
- [x] **D-3C** Exercise seed = hybrid wger + free-exercise-db, dedupe + attribution page — `done` · **must be re-fetched; the 1648-row seed and 2042 cached images were deleted**
- [x] **D-4A** Food DB USDA-first; OpenFoodFacts later — `done`
- [x] **D-5A** Chat v1 = polling — `done`
- [x] **D-6A** Media local disk in dev, S3/R2 in prod behind one interface — `done`
- [x] **D-7B** Coach onboarding invite/approval-based — `done`
- [x] **D-8A** Notifications v1 in-app only — `done`
- [x] **D-9A** Bottom navbar everywhere; floating dock on desktop — `done`
- [x] **D-K1** Repo↔vault link = sync script — `done` · `scripts/brain-sync.mjs` must be re-created, it was deleted with the repo
- [x] **D-K2** Brain plugins = Dataview + Excalidraw on a plain-markdown skeleton — `done`
- [x] **D-K3** Local-only git, one commit per milestone, owner-authorized — `done`
- [x] **D-P1** No PVP — Opus 5 fills every role solo — `done` · owner directive 2026-08-04
- [x] **D-P2** VISUAL DESIGN BIBLE > ui-ux-pro-max; the skill informs choices *within* the Bible — `done`
- [x] **D-P3** **Full rebuild from scratch**, design system before screens — `done` · owner directive 2026-08-04, see ADR-0006

## Open questions

- [ ] **OQ-3** With Opus solo, the webview E2E walk is done by Opus in the in-app browser — confirm acceptable — `pending`
- [ ] **OQ-5** The in-app Browser pane will not composite frames, so screenshot audits are
      currently impossible. Either the pane gets fixed, or the owner reviews visually in their own
      browser while measurements come from the DOM — `blocked` · owner input needed

## Gotchas (traps already hit — do not repeat)

- [x] **G-1** `npx skills add` symlinks by default; on Windows the links become dead stubs. Always `--copy` — `done`
- [x] **G-2** A repo→vault mirror must skip dot-directories: `.obsidian` holds the user's app config and `.json` is a mirrored extension. The old sync script deleted the vault's Obsidian settings — `done`
- [x] **G-3** ui-ux-pro-max's SKILL.md forbids self-installing Python; the super prompt mandates it. Prompt wins — `done`
- [x] **G-4** `/plugin install` is unavailable non-interactively; install Superpowers from the repo — `done`
- [x] **G-5** `run-server.js` is a supervisor: killing the server child alone makes it respawn and hold a lock on `data/app.db`. Kill the supervisor FIRST — `done` · blocked the repo deletion until resolved
- [x] **G-6** React-Hook-Form inputs ignore a raw `value` assignment from automation. Drive them through the native setter + an `input` event, or the form silently never submits — `done` · cost a debugging round during the audit

## Related

[[Home]] · [[TODO Phase-1]] · [[60-Decisions/0000 Index]]
