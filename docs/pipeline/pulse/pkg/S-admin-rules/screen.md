# Szabályok (`/admin/rules`) — what the screen does

LifeOS Phase 2, package S-admin-rules. Frame: design round B `lifeos/admin-rules`
(`C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x/lifeos/admin-rules@2x.png`, Figma `190:1936`,
the fix-round-2 rebuild of `182:1279`; geometry `.pulse/geometry/lifeos/admin-rules.json`).

## Who and how

- Admin only. A member or coach who opens the URL sees the admin refusal (`AdminForbidden`); the rules are never read
  for them. The server refuses anyway (`requireRole('admin')` + `assertAdmin`).
- Reached from the **Szabályok** door row on Moderáció (`/admin`, admin-view-1 of design round A) and by URL. The admin
  bar keeps its five cells; Moderáció stays lit (`navTabs.ts` owns `/admin/rules`). Back: "‹ Moderáció"
  (`routeMeta.ts` row).

## What is on it (frame order)

1. Header: back to Moderáció · **Alapértékek** (text link) · title · version line ("7. verzió" in ink, then the publishing
   admin's name and the date in text-2) · intro "A szabályok minden felhasználóra érvényesek."
2. Ten sections of rule rows (strong rule, 8, eyebrow, 8, rows on hairlines): Szokás · Feladat · Edzés · Fókusz · Kihívás
   · Kalória · Tökéletes nap · Sorozat-szorzók · Fagyasztás · Napi plafon. Pure-coin sections carry "érme" on the
   eyebrow's right; in the mixed ones the coin rows say "érme" in their sub line.
3. Each row: title, sub line, and the stepper (− · figure · +). Units: % after percentages, "nap" / "db" after the freeze
   figures, multipliers as "×1,25". An edited row's figure is ink SemiBold and its sub line starts with
   "mentve <value in force>".
4. MENTÉS: "N módosítás" (plain cap, only while there are edits) · Megjegyzés field (goes into the audit log, 280 chars)
   with the hint naming the next version · the one lime pill **Mentés** (disabled with no edit) · "A következő
   napzárástól érvényes."

## Behaviour

- The page keeps only the edits; what it shows is the set in force with the edits laid over it.
- Stepper: − / + by the row's step (coins 1, percentages 5, multipliers ×0,05, milestones 5, daily cap 10); the figure is a
  spinbutton (arrows, PageUp/PageDown ×10, Home/End). Bounds are the server's ranges; "Részleges edzés" may not exceed
  "Teljesnek számít" and the other way round (the server's refinement).
- Alapértékek lays the defaults over every rule that has a stepper. It saves nothing.
- Mentés: `PUT /admin/rules { expectedVersion, rules (every key), note? }`. 200 → the new version replaces the set,
  edits and note clear, toast "Mentve". 409 RULES_STALE → warn notice (the studio's stale sentence) with "Újra", which
  re-reads the set; the edits stay on top. Any other failure → danger notice "Nem sikerült a művelet. Próbáld újra.",
  the draft stays. Not queued offline (plan L9).
- Read failure → the header and a danger notice with "Újra". Loading → three skeleton sections.

## Not drawn by the frame, kept or built in the same language

- `mealEaten`, `perfectDayNeedsKcal` and the streak / milestone DAY rules have no stepper; they travel unchanged in every
  PUT (the day rules name their rows: "7 naptól", "30 napos mérföldkő").
- Loading, read failure, write failure, stale write, published toast, forbidden: built from the kit (skeleton rows,
  NoticeLine, ToastHost, AdminForbidden).
