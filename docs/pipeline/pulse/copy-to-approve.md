# Copy to approve — strings the owner did not draw

No visible string ships without a source: the frame, the screen's inventory note or `hu.json` (PLAN.md
R22). Where an agent had to PROPOSE a string, it is listed here. A package with an unticked VISIBLE
string stays `merged`, not `accepted`; it blocks nothing else. Strings only a screen reader gets
(`aria-label`) may be proposed freely and are listed too, marked `no` under Visible.

Rows are appended by `pulse-i18n apply` at the merge, from the `set` entries of a package's
`i18n.patch.json` whose `copy` is `proposed`. The owner ticks the last column; nothing else is edited
by hand.

| Key | hu | en | de | Visible | Package | Where (frame, source) | Approved |
|---|---|---|---|---|---|---|---|
| `plans.addBlock` | Blokk hozzáadása | Add block | Block hinzufügen | no | S-plan-editor | aria-label of the add-block group of the open day (the three '+ Egyszerű / + Szuperszett / + Kör' links); the frame layer of plan-editor-2 is named 'Blokk hozzáadása' | [ ] |
| `coaching.account.owned` | A kliens saját fiókkal rendelkezik | The client owns their account | Der Kunde verwaltet sein eigenes Konto | no | S-client-detail-a | accessible name of the lime full stop on the 124 pt monogram (client-detail-1 node 'Status dot · owns the account'); ClientDetailPage.tsx | [ ] |
| `coaching.account.pending` | Az átadás még függőben van | The handover is still pending | Die Übergabe steht noch aus | no | S-client-detail-a | accessible name of the warn full stop on the monogram while must_change_credentials = 1 (the visible sentence is coaching.handoverBody); ClientDetailPage.tsx | [ ] |
| `coaching.moreFlagged` | +{{count}} további kímélendő terület | +{{count}} more areas to protect | +{{count}} weitere zu schonende Bereiche | no | S-client-detail-a | accessible name of the '+N' count after the promoted limitation (the old tile drew the same count unnamed); ClientDetailPage.tsx | [ ] |
| `settings.equipmentCount` | {{count}} eszköz | {{count}} selected | {{count}} ausgewählt | yes | S-settings | design round A (S-profile-v2): settings-v2-2 / settings-v2-member row value 'Felszerelés · 5 eszköz' and the settings-equipment section eyebrow '5 ESZKÖZ' (nezetek/README.md: a brief string, C5). en/de avoid a plural form: the bundles have no plural keys | [ ] |
| `settings.cues.row` | Edzés közbeni jelzések | Workout cues | Signale beim Training | yes | S-settings | design round A (S-profile-v2): settings-v2-2 row 'Edzés közbeni jelzések' - the row and the title of the CueSheet it opens (nezetek/README.md: a brief string, C5); replaces settings.cues.title as the name of the three switches | [ ] |
| `settings.cues.sound` | Hang | Sound | Ton | yes | S-settings | design round A (S-profile-v2): settings-v2-2 row value 'Hang · Rezgés' - 'Hang' while the voice or the beep may sound; 'Rezgés' is settings.cues.haptics (nezetek/README.md: a brief string, C5) | [ ] |
| `admin.marketplace.report` | Bejelentés | Report | Meldung | yes | S-admin | the display title of the pushed report page, frame admin-view-3-report (design round A, approved by the owner); its README lists the word as invented and awaiting C5 (copy approval); MarketplaceQueue.tsx MarketplaceReport | [ ] |
| `settings.day.title` | Nap és időzóna | Day and time zone | Tag und Zeitzone | yes | S-day-settings | lifeos/settings-day-v2 page title and nezetek/settings-v2-2 Profil row 'Nap és időzóna' (design rounds A and B, approved by the owner) | [ ] |
| `settings.day.zone` | Időzóna | Time zone | Zeitzone | yes | S-day-settings | lifeos/settings-day-v2 section eyebrow 'Időzóna'; also the zone sheet's title and the row's accessible name | [ ] |
| `settings.day.zoneLimit` | Naponta egyszer módosítható | Can be changed once a day | Einmal am Tag änderbar | yes | S-day-settings | lifeos/settings-day-v2 sub line of the zone row (plan: a zone change at most once per 24 h; PATCH /me/prefs 409 TIMEZONE_TOO_SOON); also the zone sheet's line when the server refuses with TIMEZONE_TOO_SOON | [ ] |
| `settings.day.start` | Napkezdés | Day start | Tagesbeginn | yes | S-day-settings | lifeos/settings-day-v2 section eyebrow 'Napkezdés'; also the segmented switch's accessible name | [ ] |
| `settings.day.explain` | Új nap {{start}}-kor · a tegnapi {{settle}}-ig még módosítható. | New day at {{start}} · yesterday stays editable until {{settle}}. | Neuer Tag um {{start}} · der gestrige Tag bleibt bis {{settle}} änderbar. | yes | S-day-settings | lifeos/settings-day-v2 explanation line 'Új nap 04:00-kor · a tegnapi 10:00-ig még módosítható.' (README-jutalmak-ermek-admin.md: settles open question 10; plan L4, day D settles at start(D+1) + 6 h) | [ ] |
| `habits.todaySr` | Ma {{done}} kész a(z) {{count}} szokásból | {{done}} of {{count}} habits done today | Heute {{done}} von {{count}} Gewohnheiten erledigt | yes | S-habits | screen-reader name of the summary figure "1/3" (lifeos/habits-1) | [ ] |
| `habits.skipped` | Kihagyva | Skipped | Ausgelassen | yes | S-habits | a good habit skipped today (f_app "kihagyva"; lifeos/habit-detail legend "kihagyva") | [ ] |
| `habits.detail.relapse` | Visszaestem | I relapsed | Rückfall | yes | S-habits | bad-habit action (f_app HabitRow "Visszaestem"); not drawn in round B | [ ] |
| `habits.detail.relapseBody` | Rögzítsem a visszaesést? Ez érmelevonással jár, és nullázza a sorozatot. | Record the relapse? It costs coins and resets the streak. | Rückfall eintragen? Das kostet Münzen und setzt die Serie zurück. | yes | S-habits | relapse confirmation (f_app HabitRow, "pontlevonással" -> "érmelevonással": one currency) | [ ] |
| `habits.detail.relapseYes` | Igen, visszaestem | Yes, I relapsed | Ja, Rückfall | yes | S-habits | relapse confirmation button (f_app HabitRow) | [ ] |
| `habits.detail.stripSr` | Elmúlt 12 hét: {{done}} kész a(z) {{count}} napból | Last 12 weeks: {{done}} of {{count}} days done | Letzte 12 Wochen: {{done}} von {{count}} Tagen erledigt | yes | S-habits | screen-reader name of the 12-week strip (lifeos/habit-detail) | [ ] |
| `habits.detail.coinsSr` | {{coins}} érme a 12 hét alatt | {{coins}} coins in 12 weeks | {{coins}} Münzen in 12 Wochen | yes | S-habits | screen-reader text of the ÉRME figure | [ ] |
| `habits.detail.daysSr` | {{done}} kész a(z) {{count}} napból | {{done}} of {{count}} days done | {{done}} von {{count}} Tagen erledigt | yes | S-habits | screen-reader text of the NAPOK figure "69/78" | [ ] |
| `habits.detail.archiveTitle` | Archiválod? | Archive it? | Archivieren? | yes | S-habits | archive confirmation title (f_app app/habit/[id].tsx) | [ ] |
| `habits.detail.archiveBody` | A szokás eltűnik a napi listából, a történet megmarad. | The habit leaves the daily list; its history stays. | Die Gewohnheit verschwindet aus der Tagesliste, der Verlauf bleibt. | yes | S-habits | archive confirmation message (f_app app/habit/[id].tsx) | [ ] |
| `habits.outcome.clean` | Tiszta | Clean | Clean | yes | S-habits | bad habit clean day in the history (f_app "napja tiszta") | [ ] |
| `habits.outcome.missed` | Mulasztás | Missed | Verpasst | yes | S-habits | a missed day in the history (f_app "Levonás mulasztásért") | [ ] |
| `habits.form.editTitle` | Szokás szerkesztése | Edit habit | Gewohnheit bearbeiten | yes | S-habits | edit sheet title (f_app app/habit/[id].tsx) | [ ] |
| `habits.form.kind` | Típus | Type | Art | yes | S-habits | the kind switch accessible name (f_app "Típus") | [ ] |
| `habits.form.nameRequired` | Adj nevet a szokásnak | Give the habit a name | Gib der Gewohnheit einen Namen | yes | S-habits | name validation (f_app app/habit/[id].tsx) | [ ] |
| `habits.form.perWeek` | Hányszor egy héten? | How many times a week? | Wie oft pro Woche? | yes | S-habits | times-per-week stepper (f_app app/habit/[id].tsx) | [ ] |
| `habits.form.perWeekHint` | Vasárnap zárásnál ellenőrizzük. Napi kihagyásért nincs levonás. | Checked when Sunday closes. No deduction for a skipped day. | Wird beim Abschluss am Sonntag geprüft. Kein Abzug für einen ausgelassenen Tag. | yes | S-habits | times-per-week hint (f_app, "esti" dropped: the settle is start(D+1) + 6 h, README-ma fix round 1) | [ ] |
| `habits.form.pickDay` | Válassz legalább egy napot | Choose at least one day | Wähle mindestens einen Tag | yes | S-habits | weekday validation (f_app app/habit/[id].tsx) | [ ] |
| `habits.form.successBad` | Érme / tiszta nap | Coins / clean day | Münzen / cleaner Tag | yes | S-habits | bad habit coins label (f_app "Pont / tiszta nap", Pont -> Érme as README-ma did for the good habit) | [ ] |
| `habits.form.penaltyBad` | Levonás alapja | Deduction base | Abzugsbasis | yes | S-habits | bad habit penalty label (f_app) | [ ] |
| `habits.form.min` | Legalább 1 | At least 1 | Mindestens 1 | yes | S-habits | daily target validation (f_app "Legalább 1") | [ ] |
| `habits.form.badExplain` | A rossz szokás minden nap számít. Ha nem esel vissza, a napzárásnál jár az érme. Visszaesésnél kétszeres levonás, és nullázódik a sorozat. | A bad habit counts every day. If you do not relapse, the day close pays the coins. A relapse costs double and resets the streak. | Eine schlechte Gewohnheit zählt jeden Tag. Ohne Rückfall gibt es beim Tagesabschluss die Münzen. Ein Rückfall kostet doppelt und setzt die Serie zurück. | yes | S-habits | bad habit explanation (f_app app/habit/[id].tsx, "pont" -> "érme") | [ ] |
