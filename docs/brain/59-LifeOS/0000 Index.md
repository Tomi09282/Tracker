---
type: moc
title: LifeOS — index
tags: [index, lifeos]
---

# LifeOS effort — where it stands (2026-10-18)

The owner asked to port the features of `github.com/kytrack/f_app` ("LifeOS") into TRACKER in the Pulse design, with
stackable roles (one account; trainer / admin views entered from Profil, "back to …" switch icons first in the bar)
and an easy-to-use Profil. The approved plan: [[59-LifeOS/LifeOS Plan]].

## Owner decisions
- Port everything: habits + tasks + day close · calendar + events · focus + quick capture · points + rewards + daily challenge.
- Full gamification (streaks, multipliers, freezes, XP, levels, penalties) — reverses the earlier "no streak / XP" record.
- One currency: coins. Economy: 1 point = 1 coin, daily earn cap 400, penalties may cause debt, spends may not,
  a day settles 6 h after the next day starts, ≤ 7 days catch-up, the perfect day needs the workout.
- User bar: Ma · Edzés · Étkezés · Naptár · Haladás · Profil. Trainer: ↩ Tag · Ügyfelek · Tervek · Pult.
  Admin: ↩ Tag · ↩ Edző · Moderáció · Fiókok · Piactér · Szabályok.
- Theme packs delisted without compensation. Master: the merge is prepared locally after the Pulse closing; the owner pushes.

## Progress
State on `pulse-int` / `pulse-redesign` at `290d3ec` (2026-10-18). "Merged" means the step's `pulse(<id>)` commit is
on the branch; "handed in" means the package is done in its slot and waits for the integrator.

| Step | Packages | State |
|---|---|---|
| Pulse closing (sweep fixes, F19 cleanup 1–7, docs) | sweep-pre, sweep-fix, F19:1–7 | merged |
| Design round A (bars, Profil v2, admin pages, workout finish) | — | approved by the owner |
| Design round B (LifeOS screens, ~30 frames) | — | approved by the owner |
| Backend roles (`roles[]`, chat side filter) | B-roles | merged |
| Phase 1 nav (views, switch cells, re-pointed gates) | P1-nav | merged |
| Phase 1 screens: workout finish, Profil v2, admin section routes | S-workout-finish, S-profile-v2, S-admin-routes | merged |
| Theme-pack delisting (migration 030) | B-q2 | merged |
| Master merge prepared locally (owner pushes) | C0-master-merge-prep | done — branch `merge/pulse-into-master`, see `docs/pipeline/pulse/MASTER-MERGE.md` |
| Equipment stills | A-equipment | waiting — the 7 images are not generated yet |
| Phase 2 core (031: coin events, day boundary, day close, XP / level, admin rules) | B-core | merged |
| Phase 2 screens: Nap és időzóna, admin Szabályok | S-day-settings, S-admin-rules | merged |
| Phase 2 screen: coins / XP | S-coins-xp | handed in; merge blocked on the coins-2v2 ledger fixture (orchestrator ruling of 2026-10-18 allows a schema-checked fixture) |
| Phase 3 backend (032 habits + tasks, full day close) | B-habits-tasks | handed in, not merged yet |
| Phase 3 kit (LifeOS components) | G-lifeos | handed in, not merged yet |
| Phase 3 screens: Szokások / Feladatok / Ma | S-habits, S-tasks, S-ma | S-habits handed in; S-tasks and S-ma in progress |
| Phase 4 rewards + challenges (033) | — | next |
| Phase 5 calendar (034) | B-calendar | waiting for B-habits-tasks on `pulse-redesign` |
| Phase 6 focus + Haladás + closing (035) | B-focus | waiting for B-habits-tasks on `pulse-redesign` |

## Waiting on the owner
- 8 new tab icons (prompts: `TRACKER-mockups/5-pulse/kepek-forras/pulse/icons-extra/WEB-PROMPTOK-IKONOK.md`).
- 7 equipment stills (prompts: `.../equipment-extra/WEB-PROMPTOK.md`).
