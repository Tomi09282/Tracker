# Open items after the PLAN 7.2 sweep

Source: `.pulse/sweep/a.md` (rows 3-6) and `.pulse/sweep/b.md` (rows 7-11), run on pulse-redesign bc9b24c / de70539.

The sweep found **one regression**: row 7, the offline sign-in chunk (`src/app/router.tsx`). It is fixed on pulse-int
by `pulse(sweep-fix)` and re-run: `.pulse/sweep/fix/row7/run.json`. Everything below is **not a regression**.
These items are documentation gaps, pre-existing behaviour that base shares, kit targets or tool gaps. Each one names
the package that owns the file and the smallest fix the sweep proposed.

## Undeclared differences (documentation only)

| # | What | Owner | Smallest fix |
|---|---|---|---|
| A3-1 | workout-2: the 5 exercise-switcher buttons are `inert` (out of the accessibility tree) while the rest band shows. In base they stayed in the tree under the band. This affects keyboard and assistive-tech users. | S-workout | Add one DEV line in `pkg/S-workout/deviations.md` and `deviations.md`. Another option: drop `inert` once the band is dismissed with "Pihenő átugrása". |
| A3-2 | workout-1: switcher names read `2/4 <exercise>` (the count first) | S-workout | Add an inventory note to the handoff. |
| A3-3 | admin-1/-2 row names read `title · e-mail · age · media`. The admin-3 sort buttons report uppercase names. | S-admin | Add an inventory note to the handoff. |
| A3-4 | client-detail plan link `Aktív` -> `AKTÍV` (StatusLine case). Only the diet row is noted. | S-client-detail-a | Add an inventory note to the handoff. |

## Pre-existing behaviour (base does the same)

| # | What | Owner | Smallest fix |
|---|---|---|---|
| A4-1 | Opening `/coach/clients/:id/chat` as an account that is not the link's coach fires `POST /conversations` in a tight loop when it fails (1300+ in 2.5 s). `useClientConversation` in `features/chat/useChat.ts` has not changed since 0860942. | S-coach-chat (frozen logic: needs an owner ruling) | Open the conversation once per link: a ref guard, or `retry:false` and no re-fire after `isError`. **The most urgent item on this list**, because each attempt is a request to the live API. |
| A4-2 | The player ignores `load_mode` / `target_metric`. A bodyweight / time member gets kg + ism. fields, and the check is refused with 400 by the DB CHECK. With no target, the numeral placeholder is clipped ("isı"). | S-workout | Use "—" or the field's small label as the placeholder when there is no target. Disable the check until a value is present, or send the target. |
| A4-3 | The food search result line prints `0.3 g P /100 g` (a decimal point). The totals print `0,3 g`. | S-nutrition | Format `nutrition.resultMeta` values with the locale. |
| A4-4 | `/admin/styles` and `/playground` have no client-side role gate. They render read-only for a member or coach, and the API refuses the writes. | INT / S-style-studio | Optional: wrap both routes in the admin gate. |
| B7-1 | An offline cold start never shows the shell, because `RequireAuth` reads a network error as "signed out". An offline client-side move to a never-visited lazy route also fails. Both are the same as base. | INT (`src/app`) | Add a Pulse `errorElement` on the root route that offers a reload. It needs copy that is in no frame or note yet (R22), so it waits for the owner. |
| B8-1 | The owned Aurora row on `/coins` still describes a gradient that no longer applies. | owner (Q2: owned rows stay as they are) | None until the owner rules. |

## Kit target (worse in en/de)

| # | What | Owner | Smallest fix |
|---|---|---|---|
| A5-1 | Short chip and text-link words are under 44 pt wide: en marketplace "All" 35.6, en onboarding "Hip" 41 and "Back" 38, hu compose-hub "Élő" 39.7, hu compose-profile "Erő" (DEV-071). | F-kit (`src/ui` chipRow / textLink) | Put `min-w-11` on the hit area only (not the drawn word), so the frames' geometry stays as it is. It touches every chip row, so it should go through a kit package with its own capture. |

## Tools

| # | What | Owner | Smallest fix |
|---|---|---|---|
| A5-2 | `pulse-frames.json` names its arrival and click targets with Hungarian literals, so `pulse-shot --lang en/de` cannot open those states (the sweep hit 8). `pulse-shot` already accepts `{ "key": … }`. | F3 (`scripts/pulse-frames.json`) + each package's `states.json` override (admin-1: S-admin) | Rewrite the literals as `{ "key": … }`. Several strings map to more than one key ("Kész", "Terv", "Táplálkozás"), so each one must be chosen from the screen's source, not by reverse lookup. |
| A5-3 | The workout-1 `inView` probe looks for "Kész" by its Hungarian name. | F3 | Same fix as A5-2. |
| B9-1 | `check-pulse --report` shows 103 budgeted F19 leftovers. The only product file among them is the dead `chips` / `segmented` side control and legend in `src/ui/muscle-map/MuscleMap.tsx:269-314`, which no caller reaches. | F15 / F19 | Delete the branches, run `check-pulse --fix-down F15` and remove the budget. |
| B10-1 | `npm audit --omit=dev` in `backend/` reports 6 vulnerabilities (piscina and proxy-addr critical, multer and sharp high). The lockfile has not changed since 2026-08-06. | owner / backend | Outside Pulse. Bring it to the owner before release. |
