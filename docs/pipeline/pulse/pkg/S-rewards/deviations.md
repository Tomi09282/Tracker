# S-rewards — deviations from the frames

Frames: `lifeos/rewards-1` (Figma 189:257), `lifeos/reward-detail` (189:619), `lifeos/reward-form` (189:952), design round B, fix round 2.

- **DEV-a: the tab bar.** The frames draw round B's 6-tab user bar (Ma · Edzés · Étkezés · Naptár · Haladás · Profil). The app has 5 tabs until Naptár lands in Phase 5. The bar belongs to INT / P1-nav. Under /rewards and /rewards/:id the Profil tab is lit, because it owns '/rewards' (R-S-rewards-01).
- **DEV-b: the redeem confirmation is not drawn.** The README says that "Beváltás" and the pill open "the confirm sheet". It is the kit ConfirmSheet with f_app's copy in one currency: the reward's name, "Beváltod 80 érméért?", "Beváltom" in ink (not danger, because a redemption is not destructive), and "Mégse". Every opened sheet uses one idempotency key. A refusal (ALREADY_REDEEMED / COOLDOWN / INSUFFICIENT, or 404) closes the sheet and shows one danger toast, then the refreshed reads show the reason. A lost answer keeps the sheet open with "Újra", and the retry sends the same key, so the user is never debited twice.
- **DEV-c: undrawn states, drawn with the kit in the same language:**
  - loading: skeletons, never a spinner
  - a failed read: the danger NoticeLine with "Újra"
  - a reward that is not there, or belongs to another account: one 404 with a link back to Jutalmak
  - an empty shop: f_app's "Üres a bolt" and its line, plus "Új jutalom +"
  - an account in debt: ELKÖLTHETŐ 0, the Érmék debt line `coins.debtNotice`, no Beváltás
  - a reward that cannot be redeemed now: no pill, and the status line names the reason, in the same words as the list
  - an archived reward: no redeem block, no Szerkesztés, and "Visszaállítás" in place of "Archiválás"
  - archived rewards on the list: a footer link "Archivált jutalmak · N" opens them in place, dimmed
  - no redemption yet: the BEVÁLTÁSOK section is left out
  - a one-time reward: no Pihenő row, and the terms row reads "egyszer"
  - edit mode of the sheet: "Jutalom szerkesztése" with "Mentés"
  - a field out of range: a danger line under the field
  - a failed write: the sheet's danger dot, "Újra" and one line
- **DEV-d: the reward row is one link.** On rewards-1 the frame names only the reward's name as "opens the reward". In the app the whole row (name, cost, bar, status words) is the link, which gives a 97 pt target. "Beváltás" is a sibling control laid over the right end of the status line. One interactive element never sits inside another, and the targets probe passes.
- **DEV-e: the bar of a one-time reward that was redeemed.** The frame removes the fill and leaves only the track. The kit ProgressBar at 0 still draws its 1 pt start sliver, because the kit always marks where a meter starts.
- **DEV-f: the cooldown stepper is the frame's own line, not the kit NumberStepper.** The kit stepper is the onboarding field with a 48 pt display figure. The frame composes this line from kit parts: a data-l figure with "nap", the bare 44 pt − and +, and an edge underline. This is the same approach as admin Szabályok' RuleStepper. A new reward starts at 0 (no limit), and the frame's 7 is reached with "+". Leírás is the kit TextArea: one 44 pt line that grows, because the server keeps up to 280 characters across lines.
- **DEV-g: "Teljesítve" is the row.** Each redemption row is the toggle: it is a button with `aria-pressed`, and the kit set check (lime tick or ring) is its picture. It moves no coins.
- **DEV-h: dates.** The redemption's logical day is formatted from its `localDate` with Intl in the reader's language, for example "2026. 10. 14. · szerda" in Hungarian and "14.10.2026 · Mittwoch" in German.
- **DEV-i: Profil's JUTALMAK row** (R-S-rewards-02) is drawn only once GET /rewards answers. A server without migration 033 answers 404, so the row is absent and no figure is invented. Every Profil capture now also reads GET /rewards. In a replay without a recording that read is a 404 and nothing is drawn.
