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
