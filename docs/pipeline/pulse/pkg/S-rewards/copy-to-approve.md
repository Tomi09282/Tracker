# S-rewards — copy to approve (C5)

Strings that are not printed in the round-B frames or their README (copy "proposed" in i18n.patch.json). Everything else is copied from the frames (inventory) or is an existing sentence.

| key | hu | source |
|---|---|---|
| rewards.progressSr | Út a(z) {{name}} árához | screen-reader name of a reward row's 4 pt bar (rewards-1) |
| rewards.confirmBody | Beváltod {{count}} érméért? | the redeem confirmation (README: "opens the confirm sheet"); f_app rewards.tsx "Beváltod {cost} pontért?", pont -> érme |
| rewards.confirmYes | Beváltom | the redeem confirmation action; f_app rewards.tsx confirmText "Beváltom" |
| rewards.emptyTitle | Üres a bolt | empty JUTALOMBOLT (undrawn); f_app rewards.tsx EmptyState title |
| rewards.emptyBody | Tűzz ki célokat: mozi 600, új ruha 2000, kirándulás 5000. Az érméiddel váltod be. | empty JUTALOMBOLT (undrawn); f_app rewards.tsx EmptyState body, pont -> érme |
| rewards.archivedCount | Archivált jutalmak · {{count}} | the footer link to the archived rewards (undrawn; as habits.archivedCount) |
| rewards.onceValue | egyszer | reward-detail terms row value for a one-time reward (undrawn; the form's "Egyszer") |
| rewards.archiveTitle | Archiválod? | the archive confirmation (README: "→ ConfirmSheet"); f_app reward/[id].tsx |
| rewards.archiveBody | A jutalom eltűnik a boltból, a beváltások megmaradnak. | the archive confirmation message; f_app reward/[id].tsx |
| rewards.restore | Visszaállítás | an archived reward's action (undrawn; the api.md word, as habits.detail.restore) |
| rewards.form.nameRequired | Adj nevet a jutalomnak | reward-form name error (undrawn); f_app reward/[id].tsx |
| rewards.form.costMin | Legalább 1 érme | reward-form price error (undrawn); f_app "Legalább 1 pont", pont -> érme |
| rewards.form.costMax | Legfeljebb {{count}} érme | reward-form price error over api.md's 10000 (undrawn) |

Counts: 44 inventory, 13 proposed, 1 existing sentence.
