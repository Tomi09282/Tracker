# S-admin-moderation - Hungarian copy to approve

Every string is in `i18n.patch.json` (hu / en / de). "In a frame" = drawn in an approved admin-v2 frame (owner decision 2026-11-03); "Undrawn" = written by this package for a state no frame draws and needs the owner's yes. All keys are new copy: none is in the Hungarian inventory yet.

## In a frame

| Key | hu | en | de | Where |
|---|---|---|---|---|
| `adminStats.title` | Statisztika | Statistics | Statistik | frame admin-moderation-v2: the panel's eyebrow and the Statistics page's title (frame admin-statistics-1) |
| `adminStats.days` | {{count}} nap | {{count}} days | {{count}} Tage | frame admin-statistics-1: the window switch cells and the "30 nap" sub lines |
| `adminStats.details` | Részletek | Details | Details | frame admin-moderation-v2: door row to /admin/stats |
| `adminStats.detailsSub` | Felhasználók, aktivitás, érme, piactér | Users, activity, coins, marketplace | Nutzer, Aktivität, Münzen, Marktplatz | frame admin-moderation-v2: the door row's one-line sub |
| `adminStats.errorTitle` | Nem sikerült betölteni | Could not load | Laden fehlgeschlagen | frame admin-statistics-2 (right): the error title; also the panel's failed line (undrawn) |
| `adminStats.errorBody` | A statisztika most nem érhető el. Ellenőrizd a kapcsolatot, és próbáld újra. | The statistics are not available right now. Check your connection and try again. | Die Statistik ist gerade nicht verfügbar. Prüfe deine Verbindung und versuche es erneut. | frame admin-statistics-2 (right): the error body |
| `adminStats.panel.users` | Felhasználó összesen | Users in total | Nutzer gesamt | frame admin-moderation-v2: caption of the first figure |
| `adminStats.panel.new7d` | Új 7 napban | New in 7 days | Neu in 7 Tagen | frame admin-moderation-v2: caption of the second figure |
| `adminStats.panel.activeCoaches` | Aktív edző | Active coaches | Aktive Trainer | frame admin-moderation-v2: caption of the third figure |
| `adminStats.panel.workouts` | Edzés ma / / 7 nap | Workouts today / / 7 days | Training heute / / 7 Tage | frame admin-moderation-v2: caption of the fourth figure; the line break is the frame's (design note 7: a two-line key) |
| `adminStats.panel.pending` | Várakozó moderáció | Waiting for review | Wartet auf Prüfung | frame admin-moderation-v2: caption of the fifth figure |
| `adminStats.panel.openReports` | Nyitott jelentés | Open reports | Offene Meldungen | frame admin-moderation-v2: caption of the sixth figure |
| `adminStats.panel.curve` | Aktív naplózók · {{count}} nap | People logging · {{count}} days | Protokollierende · {{count}} Tage | frame admin-moderation-v2: the curve's caption |
| `adminStats.panel.curveToday` | {{count}} ma | {{count}} today | {{count}} heute | frame admin-moderation-v2: "9 ma" on the curve's head, the figure in ink |
| `adminStats.section.users` | Felhasználók | Users | Nutzer | frame admin-statistics-1: block label |
| `adminStats.section.activity` | Aktivitás | Activity | Aktivität | frame admin-statistics-1: block label |
| `adminStats.section.coins` | Érme | Coins | Münzen | frame admin-statistics-1: block label |
| `adminStats.section.marketplace` | Piactér | Marketplace | Marktplatz | frame admin-statistics-1: block label |
| `adminStats.section.coaches` | Edzők | Coaches | Trainer | frame admin-statistics-1: block label |
| `adminStats.section.system` | Rendszer | System | System | frame admin-statistics-1: block label |
| `adminStats.users.unit` | felhasználó | users | Nutzer | frame admin-statistics-1: unit under the users figure |
| `adminStats.users.signups` | Új regisztráció | New sign-ups | Neue Registrierungen | frame admin-statistics-1: line with day bars |
| `adminStats.users.disabled` | Letiltott | Disabled | Gesperrt | frame admin-statistics-1: line |
| `adminStats.activity.people` | naplózó ember · {{count}} nap | people logging · {{count}} days | Protokollierende · {{count}} Tage | frame admin-statistics-1: unit under the activity figure |
| `adminStats.activity.today` | Naplózók ma | Logged today | Heute protokolliert | frame admin-statistics-1: line |
| `adminStats.activity.workouts` | Befejezett edzés | Completed workouts | Abgeschlossene Trainings | frame admin-statistics-1: line with day bars |
| `adminStats.activity.nutrition` | Táplálkozás-napló | Nutrition log | Ernährungstagebuch | frame admin-statistics-1: line with day bars |
| `adminStats.activity.note` | Nincs valódi napi aktív felhasználó: a termék nem tárol utolsó belépést. A szám azokat számolja, akik aznap naplóztak valamit. | There is no real daily active user count: the product stores no last login. The figure counts the people who logged something that day. | Es gibt keine echte tägliche Nutzerzahl: Das Produkt speichert keinen letzten Login. Die Zahl zählt die Personen, die an dem Tag etwas protokolliert haben. | frame admin-statistics-1: the honesty note under the activity block |
| `adminStats.coins.moved` | érme forgalom · {{count}} nap | coins moved · {{count}} days | Münzumsatz · {{count}} Tage | frame admin-statistics-1: unit under the coin figure |
| `adminStats.coins.minted` | Kibocsátás | Issued | Ausgegeben | frame admin-statistics-1: line |
| `adminStats.coins.mintedSub` | jóváírás | credits | Gutschriften | frame admin-statistics-1: its sub line |
| `adminStats.coins.spent` | Költés | Spent | Ausgaben | frame admin-statistics-1: line |
| `adminStats.coins.spentSub` | beváltás, vásárlás | redemptions, purchases | Einlösungen, Käufe | frame admin-statistics-1: its sub line |
| `adminStats.coins.integrity` | Integritás ellenőrzés | Integrity check | Integritätsprüfung | frame admin-statistics-1: line |
| `adminStats.coins.integritySub` | tárca = főkönyv · nyugta = vásárlás | wallet = ledger · receipt = purchase | Wallet = Hauptbuch · Beleg = Kauf | frame admin-statistics-1: its sub line |
| `adminStats.coins.integrityOk` | Rendben | All good | In Ordnung | frame admin-statistics-1: the verdict (an ink dot, not green) |
| `adminStats.market.unit` | poszt | posts | Beiträge | frame admin-statistics-1: unit under the post figure |
| `adminStats.market.published` | Közzétett | Published | Veröffentlicht | frame admin-statistics-1: split legend (live) |
| `adminStats.market.draft` | Piszkozat | Draft | Entwurf | frame admin-statistics-1: split legend |
| `adminStats.market.removed` | Levéve | Taken down | Abgenommen | frame admin-statistics-1: split legend (an admin's take-down) |
| `adminStats.market.openReports` | Nyitott jelentés | Open reports | Offene Meldungen | frame admin-statistics-1: line |
| `adminStats.market.resolved` | Elintézett jelentés | Resolved reports | Erledigte Meldungen | frame admin-statistics-1: line |
| `adminStats.coaches.withClients` | edző ügyféllel | coaches with clients | Trainer mit Klienten | frame admin-statistics-1: unit under the "2 / 3" fraction |
| `adminStats.coaches.perCoach` | Ügyfél / edző | Clients / coach | Klienten / Trainer | frame admin-statistics-1: line |
| `adminStats.coaches.perCoachSub` | aktív kapcsolatok átlaga | average of active links | Durchschnitt der aktiven Verbindungen | frame admin-statistics-1: its sub line |
| `adminStats.coaches.links` | Aktív kapcsolat | Active links | Aktive Verbindungen | frame admin-statistics-1: line |
| `adminStats.system.sessions` | aktív munkamenet | active sessions | aktive Sitzungen | frame admin-statistics-1: unit under the sessions figure |
| `adminStats.system.audit` | Auditesemény | Audit events | Audit-Ereignisse | frame admin-statistics-1: line |
| `adminStats.system.auditSub` | 24 óra | 24 hours | 24 Stunden | frame admin-statistics-1: its sub line |

## Undrawn (proposed)

| Key | hu | en | de | Where |
|---|---|---|---|---|
| `adminStats.window` | Időablak | Time window | Zeitraum | undrawn: aria-label of the 7 / 30 / 90 switch |
| `adminStats.coins.integrityDrift` | Eltérés | Mismatch | Abweichung | undrawn: the verdict when the reconciliation finds a difference (integrity.ok false), a warn dot |
| `adminStats.market.scheduled` | Ütemezett | Scheduled | Geplant | undrawn: split legend for a post whose publish time is still ahead (the frame groups the posts in three) |
| `adminStats.market.withdrawn` | Visszavonva | Withdrawn | Zurückgezogen | undrawn: split legend for a post its author withdrew (the frame groups the posts in three) |

Open copy decision: the empty queue title is the owner's frame word "Nincs várakozó beküldés" (admin.queueEmptyTitle was "Nincs mit moderálni"); the frames say "levétel" for a take-down where the old bundles say "eltávolítás".
