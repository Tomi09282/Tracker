# LifeOS — zárójelentés (2026-11-03)

A f_app LifeOS funkciói (szokások, feladatok, érme-gazdaság sorozattal és XP-vel, jutalmak, napi kihívás, naptár,
fókusz) bent vannak a TRACKER-ben, Pulse dizájnban. Minden csomag a `pulse-redesign` ágon van (lokálisan, semmi
nincs pusholva). Részletek a gépen: `docs/brain/59-LifeOS/0000 Index.md`.

## Mi kész és mi látszik az appban

Minden képernyőhöz van páros kép (jóváhagyott frame | integrációs build): `.pulse/final-lifeos/pairs/`.
Csoportonként egy összesítő lap:

| Képernyő | Útvonal | Mit tud | Összesítő lap |
|---|---|---|---|
| Ma | `/` | napi számláló (pl. 3/10), mai edzés, szokások, feladatok, MAI DOBÁS, következő esemény, fókusz-ajtó, „Tökéletes nap · +25 érme napzáráskor” | `.pulse/final-lifeos/overview-ma.png` |
| Gyors rögzítés | Ma > „Rögzítés +” | feladat vagy esemény egy lapon | `overview-ma.png` |
| Napi kihívás | `/challenges`, `/challenges/pool` | 3 lehetőség, 1 újradobás, saját kihíváslista súlyokkal | `overview-ma.png` |
| Szokások | `/habits`, `/habits/:id` | jó / rossz szokás, cél, emlékeztető, sorozat, fagyasztás, szorzó | `overview-habits-tasks.png` |
| Feladatok | `/tasks` | Ma / Közelgő / Lejárt / Bármikor / Kész, prioritás szerinti érme (5 / 10 / 20), visszanyitás visszaveszi a pénzt | `overview-habits-tasks.png` |
| Jutalmak | `/rewards`, `/rewards/:id` | saját jutalombolt, beváltás érméből, pihenőidő | `overview-rewards-coins.png` |
| Érmék | `/coins` | egyenleg, tartozás („TARTOZÁS”), szint + XP, heti oszlopok, kimutatás | `overview-rewards-coins.png` |
| Naptár | `/calendar`, `/calendar/events/:id` | napsáv, események, emlékeztetők, edzések egy helyen | `overview-calendar-focus.png` |
| Fókusz | `/focus` | blokk indítása, ellenőrzések („Rajta vagyok”), befejezés, érme | `overview-calendar-focus.png` |
| Haladás > Napok | `/progress/days` | a lezárt napok pontjai és sávjai | `overview-progress-settings-admin.png` |
| Nap és időzóna | `/settings/day` | időzóna, napkezdés (00 / 02 / 04 / 06) | `overview-progress-settings-admin.png` |
| Admin > Szabályok | `/admin/rules` | a pontszabályok (napi plafon stb.), a Moderációból nyílik | `overview-progress-settings-admin.png` |
| Profil, nézetek, sávok (A kör) | `/settings`, `/coach`, `/admin` | Profil v2, Edzői / Admin nézet váltás, hat fülű sáv: Ma · Edzés · Étkezés · Naptár · Haladás · Profil | `overview-round-a.png` |

## Ellenőrzés (ma, az integrációs ágon)

- Frontend build zöld; `verify:gates` 78 sikeres, 0 hibás.
- Backend: `check:all` minden lépése zöld (eldobható, 35-ig migrált adatbázison), `smoke` 806 sikeres, 0 hibás.
- Végigjártam élesben (külön teszt-backenden, a három dev fiókkal): belépés, szokás és feladat létrehozása,
  szokás pipálása, feladat kész és visszanyitás (+10 érme, majd vissza 0-ra), napi kihívás húzása és választása,
  jutalom beváltása (érme nélkül helyesen elutasítja), esemény 15 perces emlékeztetővel, fókuszblokk, Napok;
  edzőként és adminként nézetváltás a Profilból és vissza. Minden működött; ami furcsa volt, lent a nyitott pontoknál.
- Szerepek: minden útvonalon pontosan egy fül világít, a váltó fül („Tag”, „Edző”) soha; tagként a `/coach` a tag sávját
  és a „Ez a felület edzőknek szól” üzenetet mutatja. A hat fül 360, 402 és 430 szélességen is elfér.
- Angol és német nyelven minden LifeOS képernyő lefotózva, magyar szöveg nem maradt benne.

## Biztonsági átnézés

Egy külön ügynök 12 támadást futtatott a LifeOS backend ellen (hamisítás, ismétlés, versenyhelyzet, más fiókja,
szélsőértékek, időzóna-trükk). Amit talált, és ami javítva lett (B-lifeos-polish):

- a 7 / 30 / 100 napos sorozatbónusz többször is kifizethető volt → most fiókonként és szintenként egyszer;
- időzóna vagy napkezdés visszaállításával egy lezárt nap újra „ma” lehetett → most `409 DAY_SETTLED`;
- lezárt napon feladat befejezése vagy fókusz → most `409 DAY_LOCKED`, és a pénzmozgás is elutasítja;
- üres edzés is „kész edzésnek” és érem-feltételnek számított → most kell valódi munkasorozat (vagy 10 mért perc);
- a „tökéletes nap” túl könnyű volt → most kell egy számolt jó szokás vagy a betervezett edzés;
- archivált szokás napja nem zárult le rendesen → javítva.

A javítások regressziós tesztként a backend smoke-ban futnak (ma: 806 sikeres, 0 hibás); a biztonsági átnézés
nyitott pontot nem hagyott.

## Ami rád vár

1. **8 fül-ikon és 7 eszközkép** a Higgsfield weben (a Naptár fül most helyettesítő ikon). Promptok:
   `C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepek-forras/pulse/icons-extra/WEB-PROMPTOK-IKONOK.md` és
   `.../kepek-forras/pulse/equipment-extra/WEB-PROMPTOK.md`.
2. **Master push** — leírás: `docs/pipeline/pulse/MASTER-MERGE.md`. Push előtt frissítsd a merge ágat:
   `C:/Users/Petike/Documents/Cursor/tracker-wt/merge` mappában `git merge --no-ff pulse-redesign`.
3. **Migrációk 030–035** egyeztetése a másik fejlesztővel (036 nem kellett).
4. **A 49 AI-generált kép felhasználási feltételei** — nézd meg az első push előtt (a repó nyilvános).
5. Négy kisebb szövegezési / viselkedési kérdés: `docs/pipeline/pulse/deviations.md` DEV-089 … DEV-092
   (fókusz-ajtó blokk nélkül, korai Befejezés megerősítés nélkül, Nyújtás alsor, Napok nem rajzolt állapotai).

## Utólag javítva (2026-11-03)

- **Offline hidegindítás:** térerő nélkül a Ma (a sáv és az oldal saját offline állapota) jön a belépő lap helyett. Független átvilágítás háromszor.
- **Régi hiba, útközben kiderült:** 15 perc inaktivitás után az újranyitott app a belépő lapra dobott, mert a `/auth/me` nem frissítette a munkamenetet. Javítva.
- **Kezdő kihíváslista:** az üres kihívás-listán és a Ma „Napi dobás" részén „Kezdő kihívások hozzáadása" (10 kihívás, magyarul/angolul/németül, csak kérésre).

## Nyitott pontok (lista: `docs/pipeline/pulse/review/lifeos-open.md`)

- ~~**Offline hidegindítás:**~~ (javítva, lásd fent) bejelentkezett tag térerő nélkül a belépő lapra kerül („Nincs internetkapcsolat”), nem a
  Ma-ra; netre visszatérve rendben van. Régi hiány, nem most romlott el.
- ~~**Üres kihíváslista:**~~ (javítva, lásd fent) új fióknak nincs miből húzni, amíg nem ad hozzá kihívást. Kérdés: legyen kezdő lista?
- Apróságok: a Profil lapnak nincs főcíme (akadálymentesség), egy régi, már lecserélt edzés-képernyő fotója nem fut le,
  az admin régi érme-felvétele miatt a SZINT sor nem látszik egy képen.

## Következő lépések

- A kezdő kihíváslista, ha kéred.
- Offline indulás javítása (az utolsó ismert bejelentkezéssel a sáv és a Ma mutatása).
- Az ikonok és eszközképek beépítése, amint elkészültek.
- A master push után a migrációs számok rögzítése.
