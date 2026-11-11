# S-coach-dashboard — deviations under Q4 (behaviour wins)

Each entry: what the frames show, what the app does, why. The integrator copies them into
`docs/pipeline/pulse/deviations.md` with a DEV number.

## 1. The teams sheet (Csapatok row)

- The frames show: the CSAPATOK ledger row with a chevron; the sheet behind it is not drawn.
- What the app does: the row opens the Pulse `Sheet` "Csapatok" with the underline field "Csapat neve" and
  "Létrehozás". Submitting empties the field and keeps the sheet open (today's behaviour). "Létrehozás" is a
  strong text link (`TextLink text="body" weight="strong"`), not a lime pill: the page's Új kód pill stays on
  screen under the scrim and Pulse allows one lime pill. Disabled while the field is empty or offline.

## 2. The pre-made accounts sheet

- The frames show: the "Előre létrehozott fiókok" row with a chevron; the sheet is not drawn.
- What the app does: the row opens the Pulse `Sheet` with the e-mail field, its hint and "Fiókok
  létrehozása" (a strong text link, same reason as 1). After a successful answer the temporary passwords
  are listed (warn notice line "tempOnce", rows with the name, the password and a copy button) and the sheet
  REFUSES to close by scrim, Escape, drag or the close glyph until "Bezárás" (`common.dismiss`, a danger text link) is pressed —
  the passwords exist nowhere else. The copied text is still "e-mail / password" while the row shows the
  name.

## 3. The archive confirmation

- The frames show: the archive glyph on every roster row; the confirmation is not drawn.
- What the app does: the glyph opens the Pulse `Sheet` "Biztosan archiválod?" with the 28 pt monogram, the
  sentence with the name, "Archiválás" as a danger text link (busy while in flight, disabled offline) and
  "Mégse". Never fires from the row. The kit `ConfirmSheet` is not used because it has no disabled state
  for the offline guard and puts the message in a plain paragraph without the monogram.

## 4. The forbidden page

- The frames show: not drawn.
- What the app does: a member at /coach gets the kit `EmptyState` as the page's h1 (left-aligned, no icon,
  no action) on `Screen top="root"`; the old Users disc is gone.

## 5. Undrawn data states

- Loading: one block at the numeral's cap height and one for the bar (the still is withheld), the ledger
  figures print the dash with `aria-busy`, the roster three row skeletons with `role=status`.
- Empty roster: no hero (no numeral, no split), "Névsor" with the left-aligned empty state, ledger and codes
  as they are. The roster count reads 0 only once the read has succeeded (it read 0 while loading before).
- Roster read failed: only the roster says so (`auth.errors.generic` + "Újra" as a text link).
- Teams / codes read failed: the ledger prints the dash, not 0 (before: 0).
- No live code: the heading, the pill and the door stay; no code row and no empty copy.
- Offline: Új kód in the kit's disabled pill look; every Visszavonás and every archive glyph disabled; the
  roster rows, Tervek, the bell, Csapatok and the door stay live.

## 6. Kept quirks (not fixed here, listed so nobody reads them as new)

- The roster is ordered by team, then name, although the row shows no team (the split's legend is the key).
- Expired codes still count and list as live (the filter only checks revoked and uses < max).
- Revoke is one tap with no confirmation; all Visszavonás links go busy together (one shared mutation).
- Failed mint / revoke / archive / team create / account creation show nothing, and "skipped" / "seat limit"
  answers are dropped — no copy exists for them (R22).
- "átadásra vár" never clears from the dashboard until the client changes the password.
