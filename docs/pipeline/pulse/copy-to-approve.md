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
