---
type: screen-spec
title: Haladás — Progress
route: /progress
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Haladás — Progress

The client records body measurements, watches their own trend, keeps progress photos, and controls exactly what their coach can see. Three jobs on one route, split by a tab bar that is a filter rather than navigation — the user came to answer "is it moving", and secondarily to add today's number or to change their mind about who can look.

## Anchor

One wide trend-chart card: a real line with a dot on every point, gridlines, a value scale and a date axis, headed by `82,4 kg` as the largest figure in the card and annotated `−2,1`.

A chart because the question is **a direction over time**, and only a line answers it. A ring would be wrong here for a specific reason: a ring implies a target, and this screen does not have one. The app does not know whether someone gaining weight is bulking on purpose or dieting badly.

> [!important]
> The delta is **grey in both directions** and must stay grey. `TrendChart` is passed `direction="neutral"` for every body metric, and that is a deliberate decision documented in the component: a green number is the app telling someone which way their own body should be going, and colouring weight loss green by default is the easiest way for a fitness app to say something harmful to a person with a disordered relationship to food. It costs nothing to not do.

## Blocks

1. **h1 `Haladás`.**
2. **Tab bar** — a full-width pill container split into three equal segments: `Test` | `Fotók` | `Megosztás`. The selected segment is a filled chip, the other two transparent. **This is a filter, not navigation** — one route, one URL, no per-tab endpoint to keep in step. `Test` is the default.

### Tab 1 — `Test`

3. **Trend card** for the most-recorded metric: a caption row with `Testsúly` in grey on the left and, right-aligned on the same baseline, `82,4 kg` as the card's largest number with the window's change `−2,1` annotating it in grey at caption size. The change is measured across the **whole window**, not since the previous point — a single-session dip is noise, where they started against where they are is the question. Below it the chart: an accent line, a dot on every point, a soft accent gradient fading to transparent beneath, a value scale down the left edge (`kg`, `84`, `82`, `80`) and horizontal gridlines. The x axis is real time, so uneven gaps between measurements show as uneven spacing.
4. **Axis row** under the chart: the first date on the left (`2026-05-04`), the last on the right (`2026-08-22`), and when the longest break reaches the chart's gap threshold, a warning-toned label centred between them: `23 nap kihagyás`. The gap is already visible as a long flat segment; naming its length is what stops a reader interpreting the drop after it as a week's progress.
5. **Summary tiles** — two side by side under the chart, each an icon puck over a figure over a caption: `84 cm` / `Derék · 2026-08-20`, and `18,5 %` / `Testzsír · 2026-08-18`. The latest reading of every other metric the user has actually recorded.
6. **`Mérés rögzítése` card** — a `+` badge glyph then the h2, then a wrapping control row: `Érték (kg)` as a right-aligned decimal field (comma or dot both accepted), `Mikor` as a compact date field defaulting to the phone's local today (`2026-08-23`), and the filled primary `Mentés`. Saving writes the measurement and clears the value field only — the date stays, because back-dating a run of forgotten measurements is a real session.
7. **`Bejegyzések`** — the h2, then one bordered card holding hairline-divided rows, newest first. Each row: the bold metric name over a grey tabular caption `2026-08-22 · 82,4 kg`, with a ghost trash icon-button at the right. Instant delete, no confirm.

### Tab 2 — `Fotók`

8. **`Fotó hozzáadása`** — the h2, then, **before any control**, the grey privacy line `A fotóidat alapból SENKI nem látja — az edződ sem, amíg te nem engeded meg.` Someone about to photograph their body deserves to know who can see it before they choose the file, and the answer is nobody. Then the row: `Mikor` date field and a bordered, button-shaped file picker labelled `Fájl választása`, accepting JPEG, PNG and WebP only. While the upload runs, the grey word `Mentés folyamatban` appears beside it.
9. **Photo grid** — three columns of square, cover-cropped, rounded thumbnails. Each tile carries a small date chip on a solid pill at the bottom-left (`2026-08-22`) and a ghost trash icon-button at the top-right. Images come from the gated media route, never a static path — the storage key is not the permission. No lightbox and no compare slider: tapping a photo does nothing.

### Tab 3 — `Megosztás`

10. **`Ki láthatja`** — a shield-check glyph in the h2, then the grey caption `Külön dönthetsz a mérésekről és a fotókról. Bármikor visszavonhatod, és azonnal érvényes.` Then one sub-card per coach link: the coach's email truncated on the first line (`edzo@pelda.hu`), with a small outlined uppercase `LEZÁRULT` chip opposite it when the coaching link is over — an ended link is shown as ended rather than hidden, because "I revoked it" and "they left" are different facts and the client is entitled to both. Under it two rows meeting the tap floor, label left and an accent checkbox right: `Mérések megosztása` and `Fotók megosztása`. When either is on, a compact danger button `Minden hozzáférés visszavonása` appears at the bottom of that sub-card. No coach: the single grey line `Nincs edződ, akivel megoszthatnád.`
11. **`Ki nézte meg`** — an eye glyph in the h2, then bordered rows with the viewer's email in bold over a grey tabular caption: `Megnézett egy fotót · 2026. 08. 21. 19:42`, `Megnézte a méréseidet · 2026. 08. 19. 08:07`.

> [!important]
> Sharing lives on this screen, next to the thing it governs — not in Settings. A consent control three taps from its subject is a consent control people forget they gave. Do not "tidy" it into a settings page.

## What was merged away, and why

- **The `Mit mérsz` select is gone from the record form**, and this is the most contestable cut on the screen. The code makes that select full width for a measured reason: sharing a wrapped row with the value, the date and the save button squeezed it below the tap-target floor in one dimension, and it carries the longest label in the form (`Alkar (jobb)`). Removing it turns the form into two fields and a button, which is what the top third needed — but the metric has to come from *somewhere*.
- **Every metric after the first lost its chart card**, replaced by a summary tile. This is the core of the redesign: a vertical stack of identical chart cards was the "whole UI is data fields" complaint expressed as charts. One chart at full size plus two compact tiles reads as a hierarchy instead of a list, and it buys the record form a place above the fold.
- **The insufficient-data card left the frame.** The rule survives untouched: `TrendChart` refuses to draw below three points and says `Még kevés adat a grafikonhoz (2 nap). Három edzésnap kell hozzá — két pont még nem trend.` Two points is not a trend, and a line between two dots will be read as a direction.
- **The armed delete state was cut.** Delete is one tap, matching the code and matching the food log.
- **Entry rows collapsed from one card each into one card with dividers**, and three of six rows are out of frame — the list runs past the bottom edge. Do not build a fixed-height entries area.

> [!important]
> Fifteen metrics still need a way in. Two honest answers: the select comes back (full width, as the code measured it), or the chart card itself owns the metric selection and the form binds to whatever the chart is showing — with the unit suffix on `Érték (kg)` following it, and the summary tiles acting as the way to switch. Shipping the form with the metric hard-coded to `Testsúly` silently deletes fourteen features.

## States

- **Empty (`Test`)** — `EmptyState` with a line-chart icon, title `Még nincs mérés`, body `Rögzíts legalább három mérést, és megjelenik a trend.`
- **Thin data** — a recorded metric with fewer than three points draws no chart at all, only the sentence. A metric never entered gets no card and no tile — never an empty axis pretending to be data.
- **Loading (`Test`)** — two skeleton cards. **(`Fotók`)** — three square skeletons in the same grid.
- **Error** — only one, and it is inline: the value field takes a danger outline with a leading warning glyph, and the danger line appears under it — `Ez az érték kívül esik a hihető tartományon. Ellenőrizd, nem ütöttél-e el valamit.` It is announced as an alert. This is the database's typo guard reaching the user as a plain sentence rather than as silence or a stack trace.
- **Offline** — the shell's strip only.
- **Empty (`Fotók`)** — camera icon, `Még nincs fotó` / `Az összehasonlításhoz legalább kettő kell, ugyanabban a pózban.` Upload failure: `A feltöltés nem sikerült. Csak JPEG, PNG vagy WebP kép tölthető fel.`
- **Empty (`Megosztás`)** — `Nincs edződ, akivel megoszthatnád.` for the consent card; `Még senki nem nézte meg.` for the access log.
- **Role-gated** — an ended coaching link shows `LEZÁRULT` and **disables both toggles**. A coach never opens this route; they read the same measurement and photo lists read-only inside the client detail tabs `Terv / Táplálkozás / Haladás / Üzenetek`, and only whatever the client toggled on here.
- **No modals anywhere on this route** — no bottom sheet, no dialog, no toast, no confirmation step. Deletes and consent changes take effect on tap.

> [!warning]
> A failed measurement fetch reads as the empty state — the user is told to record their first measurement when they have a hundred. The only error path on this screen is the range check on the write.

## Components

- Reused as-is: `TrendChart` with `direction="neutral"` and its longest-gap annotation; `EmptyState`; `Skeleton`; `Pressable` for the tab chips (as real tabs, with the selected state announced), the primary `Mentés`, the danger `Minden hozzáférés visszavonása`, and the ghost icon trash buttons; the `control` recipe for every tap-target floor; the local `Toggle` — the consent rows are accent checkboxes, and `Switch` exists but is deliberately not used here. Swapping them is a separate decision, not a side effect of this redesign.
- **New**:
  - The summary tile — the same component the nutrition screen needs, with an icon puck, a figure and a `label · value` caption. Build it once.
  - The invalid-field treatment: danger outline plus a leading warning glyph *inside* the field, paired with the existing message line.
  - The section badge glyph before `Mérés rögzítése`.
  - **The chart's value scale and gridlines do not exist.** `TrendChart` today draws a line, an area, a final dot and two date labels — nothing else. The mockup's left-hand scale and horizontal rules are an addition to the shared chart component, which means every other caller inherits them. That is either the right upgrade for all of them or a variant flag; decide before drawing it.
  - The entries card with internal dividers, replacing one card per row.

## Navigation

Bottom bar, `HALADÁS` active. Member: five tabs — `KEZDŐLAP`, `EDZÉS`, `ÉTKEZÉS`, `HALADÁS`, `PROFIL`. Coach: six. Admin: seven. The `Test` / `Fotók` / `Megosztás` bar is **not** navigation and must never change the URL or the active tab.

> [!warning]
> As on every redesigned screen: `BottomNav` clamps its tab list, and a six- or seven-item bar cannot ship against that clamp. It has already silently hidden a route once.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/05-haladas.webp]]
![[_mockups/vilagos/05-haladas.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
