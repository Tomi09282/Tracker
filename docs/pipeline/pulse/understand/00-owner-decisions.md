# Owner decisions — Pulse implementation (2026-10-11)

Answered by the owner on 2026-10-11, after the planning run had started. These are FINAL and
override any option a reader note or a plan left open. A plan that contradicts one of them is wrong.

## D1 — Theme packs: Pulse is the only look; the previous packs are deleted

His words: "egyelőre legyen a Pulse az egyetlen, de majd később adunk hozzá. Előzőeket töröljük."

- Pulse is the single look of the app. There is no coexistence period with liquid glass and no
  per-screen opt-in: it is a hard switch on the `pulse-redesign` branch.
- The seven existing theme packs, the aurora skins, the glass tokens and `data-transparency` are
  removed, not kept selectable. New packs will be designed for Pulse later — so keep the *mechanism*
  cheap to bring back (one place where a pack could override the accent), but ship no pack now.
- Consequence to plan, not to improvise: packs are sold for coins today (theme routes + store
  items on the backend). Removing purchasable items is a backend change with a migration and it
  touches the coin ledger, so it is its OWN work package under the backend rules (named worker
  transaction, numbered `user_version` migration, no silent loss of what a user bought). Until that
  package lands the frontend simply offers no pack UI; it must not break if the API still returns
  packs or a stored pack id.
- The element-variant system (Style Studio, E1..E20) is a different thing from theme packs. He did
  not rule on it. Default: Pulse becomes the one variant of each element; the gate that freezes the
  roster keeps its intent.

## D2 — The muscle selector's door: the "Edzés" tab + a row on Home

- When no workout session is running, the "Edzés" tab shows the muscle selector / exercise library
  instead of an empty player. When a session runs, it shows the player, as today.
- Home also carries a row that opens the library.
- No new tab.

## D3 — Finish-workout: after the screens, as a separate package

- The redesign stays frontend-only. The "finish workout" action drawn in the workout frames is NOT
  implemented in the screen phase and must not be faked (no button that does nothing).
- It becomes its own package at the end (backend endpoint + hook + copy), under the backend rules.

## D4 — Git: commit step by step on `pulse-redesign`, never push

- Every finished step is its own local commit on `pulse-redesign` so it can be rolled back.
- Do not push. Do not touch `master`. The repo is public and Krisz commits to master.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
