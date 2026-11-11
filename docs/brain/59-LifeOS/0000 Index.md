---
type: moc
title: LifeOS — index
tags: [index, lifeos]
---

# LifeOS effort — where it stands (2026-11-03)

The owner asked to port the features of `github.com/kytrack/f_app` ("LifeOS") into TRACKER in the Pulse design, with
stackable roles (one account; trainer / admin views entered from Profil, "back to …" switch cells first in the bar)
and an easy-to-use Profil. The approved plan: [[59-LifeOS/LifeOS Plan]]. The owner's report:
`docs/pipeline/pulse/LIFEOS-REPORT.md`.

## Owner decisions
- Port everything: habits + tasks + day close · calendar + events · focus + quick capture · points + rewards + daily challenge.
- Full gamification (streaks, multipliers, freezes, XP, levels, penalties) — reverses the earlier "no streak / XP" record
  ([[60-Decisions/0022-lifeos-gamification-and-one-currency]]).
- One currency: coins. Economy: 1 point = 1 coin, daily earn cap 400 (streak milestones 7 / 30 / 100 days are outside
  the cap), penalties may cause debt, spends may not, a day settles 6 h after the next day starts, ≤ 7 days catch-up,
  the perfect day needs the workout.
- User bar: Ma · Edzés · Étkezés · Naptár · Haladás · Profil. Trainer: Tag · Kliensek · Tervek · Pult.
  Admin: Tag · Edző · Moderáció · Fiókok · Piactér (Szabályok is reached from Moderáció).
- Theme packs delisted without compensation. Master: the merge is prepared locally; the owner pushes.

## Decisions recorded
- [[60-Decisions/0022-lifeos-gamification-and-one-currency]] — the economy sheet, one currency.
- [[60-Decisions/0023-views-are-derived-from-the-url]] — which bar a screen shows.
- [[60-Decisions/0024-the-logical-day-boundary]] — the user's day, the lazy settle.
- [[60-Decisions/0025-penalties-may-cause-debt-spends-may-not]] — the negative balance.

## State: every package is merged
On `pulse-int` / `pulse-redesign` (2026-11-03). Data model: the generated notes in `20-Data-Model` (`coin_events`,
`point_rule_sets`, `user_prefs`, `daily_summaries`, `habits`, `habit_logs`, `habit_day_results`, `tasks`,
`challenges`, `challenge_draws`, `rewards`, `reward_redemptions`, `events`, `event_reminders`,
`reminder_deliveries`, `focus_sessions`); API: `30-API/Endpoints.md` (229 endpoints, the LifeOS routers included).

| Phase | Packages | Migration | State |
|---|---|---|---|
| 1 Nav + roles | B-roles, P1-nav, S-workout-finish, S-profile-v2, S-admin-routes | — | merged |
| Q2 theme packs | B-q2 | 030 | merged |
| 2 Core (coin events, day boundary, XP, admin rules) | B-core, S-day-settings, S-admin-rules, S-coins-xp | 031 | merged |
| 3 Habits + tasks + Ma | B-habits-tasks, G-lifeos, S-habits, S-tasks, S-ma (+ three fix packages) | 032 | merged |
| 4 Rewards + challenges | B-rewards-challenges, S-rewards, S-challenges | 033 | merged |
| 5 Calendar | B-calendar, S-calendar | 034 | merged |
| 6 Focus + Haladás > Napok | B-focus, S-focus, S-progress-days | 035 | merged |
| Security review + polish | B-lifeos-polish, S-lifeos-polish | — | merged |
| Closing (regression, end to end, docs, report) | LifeOS-closing | — | merged |

The closing regression (2026-11-03): frontend build and verify:gates green (78 passed); backend check:all green on a
throwaway DB migrated to 35, smoke 806 passed 0 failed; roles, widths and the end-to-end walk in the owner's report;
pictures under `.pulse/final-lifeos/` (git-ignored). Open findings: `docs/pipeline/pulse/review/lifeos-open.md`.

## Waiting on the owner
- 8 new tab icons and 7 equipment stills, generated on the Higgsfield web (prompts under
  `TRACKER-mockups/5-pulse/kepek-forras/pulse/`).
- The master push (`docs/pipeline/pulse/MASTER-MERGE.md`; refresh the merge branch first), migrations 030–035 agreed
  with the other developer, and the usage terms of the 49 AI-generated images before the first push.
