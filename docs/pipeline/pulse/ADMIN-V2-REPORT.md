# Admin v2 — zárójelentés (2026-11-08)

Az admin felület második köre bent van a TRACKER-ben, Pulse dizájnban: egy fiókot meg lehet nézni és
javítani, a piactér posztjait meg lehet nézni, levenni és visszaállítani, a Moderáció tetején statisztika-panel
van, mellette egy részletes Statisztika oldal. A csomagok a `pulse-redesign` ágon vannak (pusholva); ez a
jelentés, az ADR és a képernyő-oldal a `work/admin-v2-closing` ágon készült, még nincs pusholva.
Részletek a gépen: `docs/brain/58-Pulse/Screens/admin-v2.md`, a döntések indoka:
`docs/brain/60-Decisions/0026-admin-v2-inspect-and-correct.md`.

## Mi kész és mi látszik az appban

Admin nézetben, az admin sávon: **Moderáció · Fiókok · Piactér**. A Részletek és a Szabályok ajtósor, nem fül,
ezért ott a Moderáció fül marad világos.

| Képernyő | Útvonal | Mit tud |
|---|---|---|
| Moderáció | `/admin` | STATISZTIKA panel hat számmal (felhasználó összesen, új 7 napban, aktív edző, edzés ma / 7 nap, várakozó moderáció, nyitott jelentés), 30 napos görbe, két ajtósor (Részletek, Szabályok), alatta a moderációs sor |
| Statisztika | `/admin/stats` | 7 / 30 / 90 napos ablak, hat blokk: Felhasználók, Aktivitás, Érme (integritás-ellenőrzéssel), Piactér, Edzők, Rendszer |
| Fiókok | `/admin/accounts` | keresés névben és e-mailben (ékezet nélkül is), szerep / állapot / rendezés, „28 fiók", lapozás („Továbbiak 24 / 28"); az állapot az URL-ben van |
| Egy fiók | `/admin/accounts/:id` | fiók, edzői oldal, piactér, érme, tevékenység (csak darabszám), napló; műveletek: név, szerepkör, letiltás / engedélyezés (indokkal), érme-korrekció, kijelentkeztetés mindenhonnan, kizárás feloldása, jelszócsere kötelezése |
| Érme-napló | `/admin/accounts/:id/coins` | egy fiók teljes érme-főkönyve; nem létező fióknál „Ez a fiók nem található" |
| Piactér | `/admin/marketplace` | Jelentések (ügyekben: azonos indokú jelentések egy tárgyra, a különböző bejelentők számával) és Posztok (keresés, állapotszűrő, „N jelentés" jelzés) |
| Egy poszt | `/admin/marketplace/posts/:publicId` | állapot, a levétel indoka, **Visszaállítás**, adatok, szerző, idővonal, szöveg-kivonat, képek, jelentések, kezelés |

Amit az admin szándékosan **nem** tehet: nem szerkeszti a poszt szövegét (a tulajdonos döntése), nem lát edzést,
fényképet, mérést vagy étkezési naplót (csak darabszámot), a Statisztikából nem lehet egy emberre lefúrni, és a
saját fiókján nem változtathatja a szerepkörét, nem tilthatja le magát és nem adhat magának érmét.

## Ellenőrzés (ma, az integrációs ágon)

- Frontend build zöld; `verify:gates` 78 sikeres, 0 hibás, 7 alvó (a végén a fa bájtra azonos, tiszta).
- Backend: `check:all` minden lépése zöld (eldobható, 35-ig migrált adatbázison), `smoke` 1364 sikeres, 0 hibás.
- Végigjártam élesben, böngészőben, külön teszt-backenden és eldobható adatbázison (a dev adatbázishoz nem nyúltam):
  - a Moderáció panel hat száma és a Statisztika mind a hat blokkja **pontosan egyezik** azzal, amit a szerver ad;
  - a 7 / 30 / 90 napos váltó átállítja az ablakot és az URL-t (`?days=90`);
  - a fiók-lista, a keresés („kovacs" megtalálja a „Kovács"-ot), a lapozás, a letiltott szerző fiókoldala, az érme-napló,
    a nem létező fiók állapota;
  - a **saját fiók** oldalán nincs szerepkör-, letiltás- és érme-sor, és ott áll: „A saját fiókodat itt nem módosíthatod.";
  - egy poszt visszaállítása a felületen (megerősítő lap → ÉLŐ → a szerveren `live`, nyilvánosan újra 200), a második
    visszaállítás 409 és nem ír új audit-sort;
  - a letiltott edző bejegyzése névtelen látogatónak **404**, és nincs a nyilvános feedben, a kontroll (engedélyezett
    edző bejegyzése) látszik; az admin a posztnál látja, hogy miért nem látszik (`author_disabled`);
  - egy letiltott admin visszaengedése csak indokkal `401 step_up_required`, rossz jelszóval `401 step_up_failed`,
    jó jelszóval 200.
- **Egy dolog elromlott, és nem a termék:** a repó `seed-moderation-demo.mjs` scriptje szövegként írta a beküldés
  idejét (`datetime('now')`), az éles útvonal egész számot ír (`unixepoch()`). A régi felület elnézte, az Admin v2
  relatív idő-számolása nem: az egész Moderáció oldal összeomlott egyetlen ilyen soron. A scriptet javítottam
  (`unixepoch()`), a hibás sort a teszt-adatbázisban is.
- A konzolban a javítás után nem maradt hiba (a bejelentkezés előtti munkamenet-próba 401-ét leszámítva).

## Biztonsági átnézés

Egy külön ügynök nyolc támadást futtatott az admin backend ellen (2026-11-04), a képernyő-átnézések pedig további
backend-tételeket hoztak. Ami kiderült, és javítva lett (`B-admin-polish`, két kör):

- **Magas:** egy letiltott **admin** visszaengedéséhez elég volt egy indok. Egy ellopott admin-munkamenettel vissza lehetett
  hozni egy letiltott admint, aki a lopott munkamenet visszavonása után is megtartotta az admin jogot → most a
  visszaengedés is a saját jelszót kéri, mint az admin jog adása.
- **Magas:** a „kijelentkeztetés mindenhonnan" nem csinált semmit, ha nem volt nyitott munkamenet, így egy kimásolt
  hozzáférési token tovább működött → most csak akkor „már megtörtént", ha tényleg nem lehet bejelentkezni.
- **Közepes:** `0x10`, ` 5`, `05`, `5e0` mint fiókazonosító a 16-os, az 5-ös fiókot érte el → most csak a szabályos
  tízes számírás fogadható el.
- **Közepes:** a név elfogadott láthatatlan, irányváltó karaktereket és üres „névnek látszó" jeleket; **közepes:** az
  audit-naplóba (ami hozzáfűzős, és az ember után is megmarad) rossz karakterek kerülhettek az indokból → most
  mindkettőt elutasítja a szerver.
- **A piactér láthatósági rése:** egy letiltott vagy lefokozott edző közzétett posztjai, profilja, címtár-bejegyzése és
  képei **továbbra is nyilvánosan látszottak**, mert az olvasó oldal nem nézte a szerző fiókját. Most minden nyilvános
  olvasás megköveteli, hogy a szerző engedélyezett edző vagy admin legyen (ma élesben is megnéztem).
- A képernyő-átnézésből: a napló nyers gépi kódokat írt (most az admin eseményeket szavakkal), egy rossz step-up
  jelszót kétszer küldött el a kliens (most egyszer), és egy nem létező fiók érme-naplója üres lapot rajzolt (most 404).

A javítások regressziós tesztként a smoke-ban futnak, és 45 tervezett hibával (26 a posztoknál, 16 a fiókoknál, 3 a
statisztikánál) bizonyították, hogy a tesztek pirosra váltanak, ha a kód elromlik.

## Ami rád vár

1. **Két termékdöntés a biztonsági átnézésből**
   - Ha egy szerző visszavonja a profilja közzétételét (ettől a posztja eltűnik a nyilvánosság elől), majd **szerkeszti** a
     posztot, az admin a soha nem nyilvános új szöveget látja. A piszkozatét nem látja. Kell-e minden jelenleg nem látható,
     nem levett poszt szövegét eltitkolni, vagy elég egy utolsó nyilvános változat? (D1)
   - A név tartalmazhat `<script>`-szerű szöveget. A React kiescapeli, és ma nincs olyan hely, ahol nem escape-elődik, de
     hogy milyen karakter lehet egy névben, termékszabály (a `PATCH /auth/me` is ugyanezt a szabályt használja).
2. **DEV-094 … DEV-100** (`docs/pipeline/pulse/deviations.md`), ezek mind a te dönteredre várnak. A leginkább érdemiek:
   a fiók naplója csak az e-mailt és a műveletet mutatja (094); **egy levett szerzői profilt nem lehet visszaállítani**,
   ehhez új backend útvonal kell (096); három poszt-keret régebbi, mint a termék (097); 9 999 felett a szám „12k" (098); a
   moderációs sor csak az első 50-et mutatja, kurzor nélkül (099).
3. **Master merge** — változatlanul a te döntésed (`docs/pipeline/pulse/HANDOFF.md`). A migrációk 030–035; az Admin v2
   **nem hozott új migrációt**.

## Nyitott pontok

- **Egy rossz idő-érték az egész Moderációt eldobja.** A termék minden írója egész számot ír, ezért nincs ismert módja,
  hogy ez élesben megtörténjen, de a felületnek elég lenne egy `—`-t kirajzolnia. Kis, hatókörön belüli módosítás
  (`ModerationQueue.tsx`, a `useAgo`), nem csináltam meg, mert nem a kért zárás része.
- A teszt-adatokon a panel **9 nyitott jelentést** mutatott, a Piactér Jelentések fül **8-at**: a panel jelentést számol, a
  fül ügyet (azonos indok, azonos tárgy). Szándékos, de aki egymás mellett látja, kérdezni fog.
- Ismert, korlátos, nem javított: az admin írási kerete tartományonként külön számolódik; a fiók-keresés ~50 000 fióknál
  teljes táblaolvasás (~290 ms, a 300 / 15 perces olvasási keret mögött); az `audit_log`-on nincs `(created_at)` és
  `(target_type, target_id)` index, ez egy hosszú életű naplónál az első, ami fájni fog (jövőbeli migráció).
- **Az összesítő lapok nincsenek meg.** A LifeOS-nál ezek az `.pulse/` mappából készültek a jóváhagyott keretekkel
  párban; az `.pulse/` mappa és a jóváhagyott keretek a tulajdonos gépén vannak, a repóban nincsenek. Helyette van az élő
  végigjárás fent.
- A generált dokumentáció közül az `Endpoints.md` újra lett generálva (229 → 239 végpont, a tíz új Admin v2 útvonal).
  Az adatmodell-oldalakat nem commitoltam: a generátor minden futásnál átírja mind a ~100 oldal dátumát és sorszámát,
  és az érdemi eltérés csak néhány index-, trigger- és ellenőrzés-sor öt táblánál (régebbi migrációkból).
- Apróság: a `docs/brain/60-Decisions` alatt a 0011, 0012 és 0013 kétszer szerepel (párhuzamos munka). Nem számoztam át.

## Következő lépések

- A `pulse/X-exercise-i18n` összefésülése: egy külön ágon (`work/exercise-i18n`) kész, konfliktus nélkül, a teljes `check:all` zöld.
- A fenti döntések, aztán a `Moderáció` kis idő-védelme, ha kéred.
- A master merge, ha eldöntöd; előtte a migrációs számok egyeztetése a másik fejlesztővel.
