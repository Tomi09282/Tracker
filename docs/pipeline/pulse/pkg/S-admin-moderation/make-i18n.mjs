// Writes i18n.patch.json (run: node make-i18n.mjs). The Hungarian is what the approved frames draw
// (admin-moderation-v2, admin-moderation-v2-empty, admin-statistics-1, admin-statistics-2); en and de are
// written here. Strings the frames do not draw are marked "undrawn" in `source`.
import fs from 'node:fs';

const FRAME = 'frame admin-moderation-v2';
const STAT = 'frame admin-statistics-1';
const rows = [
  // [key, hu, en, de, source]
  ['adminStats.title', 'Statisztika', 'Statistics', 'Statistik', `${FRAME}: the panel's eyebrow and the Statistics page's title (${STAT})`],
  ['adminStats.window', 'Időablak', 'Time window', 'Zeitraum', 'undrawn: aria-label of the 7 / 30 / 90 switch'],
  ['adminStats.days', '{{count}} nap', '{{count}} days', '{{count}} Tage', `${STAT}: the window switch cells and the "30 nap" sub lines`],
  ['adminStats.details', 'Részletek', 'Details', 'Details', `${FRAME}: door row to /admin/stats`],
  ['adminStats.detailsSub', 'Felhasználók, aktivitás, érme, piactér', 'Users, activity, coins, marketplace', 'Nutzer, Aktivität, Münzen, Marktplatz', `${FRAME}: the door row's one-line sub`],
  ['adminStats.errorTitle', 'Nem sikerült betölteni', 'Could not load', 'Laden fehlgeschlagen', "frame admin-statistics-2 (right): the error title; also the panel's failed line (undrawn)"],
  ['adminStats.errorBody', 'A statisztika most nem érhető el. Ellenőrizd a kapcsolatot, és próbáld újra.', 'The statistics are not available right now. Check your connection and try again.', 'Die Statistik ist gerade nicht verfügbar. Prüfe deine Verbindung und versuche es erneut.', 'frame admin-statistics-2 (right): the error body'],
  ['adminStats.panel.users', 'Felhasználó összesen', 'Users in total', 'Nutzer gesamt', `${FRAME}: caption of the first figure`],
  ['adminStats.panel.new7d', 'Új 7 napban', 'New in 7 days', 'Neu in 7 Tagen', `${FRAME}: caption of the second figure`],
  ['adminStats.panel.activeCoaches', 'Aktív edző', 'Active coaches', 'Aktive Trainer', `${FRAME}: caption of the third figure`],
  ['adminStats.panel.workouts', 'Edzés ma\n/ 7 nap', 'Workouts today\n/ 7 days', 'Training heute\n/ 7 Tage', `${FRAME}: caption of the fourth figure; the line break is the frame's (design note 7: a two-line key)`],
  ['adminStats.panel.pending', 'Várakozó moderáció', 'Waiting for review', 'Wartet auf Prüfung', `${FRAME}: caption of the fifth figure`],
  ['adminStats.panel.openReports', 'Nyitott jelentés', 'Open reports', 'Offene Meldungen', `${FRAME}: caption of the sixth figure`],
  ['adminStats.panel.curve', 'Aktív naplózók · {{count}} nap', 'People logging · {{count}} days', 'Protokollierende · {{count}} Tage', `${FRAME}: the curve's caption`],
  ['adminStats.panel.curveToday', '{{count}} ma', '{{count}} today', '{{count}} heute', `${FRAME}: "9 ma" on the curve's head, the figure in ink`],
  ['adminStats.section.users', 'Felhasználók', 'Users', 'Nutzer', `${STAT}: block label`],
  ['adminStats.section.activity', 'Aktivitás', 'Activity', 'Aktivität', `${STAT}: block label`],
  ['adminStats.section.coins', 'Érme', 'Coins', 'Münzen', `${STAT}: block label`],
  ['adminStats.section.marketplace', 'Piactér', 'Marketplace', 'Marktplatz', `${STAT}: block label`],
  ['adminStats.section.coaches', 'Edzők', 'Coaches', 'Trainer', `${STAT}: block label`],
  ['adminStats.section.system', 'Rendszer', 'System', 'System', `${STAT}: block label`],
  ['adminStats.users.unit', 'felhasználó', 'users', 'Nutzer', `${STAT}: unit under the users figure`],
  ['adminStats.users.signups', 'Új regisztráció', 'New sign-ups', 'Neue Registrierungen', `${STAT}: line with day bars`],
  ['adminStats.users.disabled', 'Letiltott', 'Disabled', 'Gesperrt', `${STAT}: line`],
  ['adminStats.activity.people', 'naplózó ember · {{count}} nap', 'people logging · {{count}} days', 'Protokollierende · {{count}} Tage', `${STAT}: unit under the activity figure`],
  ['adminStats.activity.today', 'Naplózók ma', 'Logged today', 'Heute protokolliert', `${STAT}: line`],
  ['adminStats.activity.workouts', 'Befejezett edzés', 'Completed workouts', 'Abgeschlossene Trainings', `${STAT}: line with day bars`],
  ['adminStats.activity.nutrition', 'Táplálkozás-napló', 'Nutrition log', 'Ernährungstagebuch', `${STAT}: line with day bars`],
  [
    'adminStats.activity.note',
    'Nincs valódi napi aktív felhasználó: a termék nem tárol utolsó belépést. A szám azokat számolja, akik aznap naplóztak valamit.',
    'There is no real daily active user count: the product stores no last login. The figure counts the people who logged something that day.',
    'Es gibt keine echte tägliche Nutzerzahl: Das Produkt speichert keinen letzten Login. Die Zahl zählt die Personen, die an dem Tag etwas protokolliert haben.',
    `${STAT}: the honesty note under the activity block`,
  ],
  ['adminStats.coins.moved', 'érme forgalom · {{count}} nap', 'coins moved · {{count}} days', 'Münzumsatz · {{count}} Tage', `${STAT}: unit under the coin figure`],
  ['adminStats.coins.minted', 'Kibocsátás', 'Issued', 'Ausgegeben', `${STAT}: line`],
  ['adminStats.coins.mintedSub', 'jóváírás', 'credits', 'Gutschriften', `${STAT}: its sub line`],
  ['adminStats.coins.spent', 'Költés', 'Spent', 'Ausgaben', `${STAT}: line`],
  ['adminStats.coins.spentSub', 'beváltás, vásárlás', 'redemptions, purchases', 'Einlösungen, Käufe', `${STAT}: its sub line`],
  ['adminStats.coins.integrity', 'Integritás ellenőrzés', 'Integrity check', 'Integritätsprüfung', `${STAT}: line`],
  ['adminStats.coins.integritySub', 'tárca = főkönyv · nyugta = vásárlás', 'wallet = ledger · receipt = purchase', 'Wallet = Hauptbuch · Beleg = Kauf', `${STAT}: its sub line`],
  ['adminStats.coins.integrityOk', 'Rendben', 'All good', 'In Ordnung', `${STAT}: the verdict (an ink dot, not green)`],
  ['adminStats.coins.integrityDrift', 'Eltérés', 'Mismatch', 'Abweichung', 'undrawn: the verdict when the reconciliation finds a difference (integrity.ok false), a warn dot'],
  ['adminStats.market.unit', 'poszt', 'posts', 'Beiträge', `${STAT}: unit under the post figure`],
  ['adminStats.market.published', 'Közzétett', 'Published', 'Veröffentlicht', `${STAT}: split legend (live)`],
  ['adminStats.market.scheduled', 'Ütemezett', 'Scheduled', 'Geplant', 'undrawn: split legend for a post whose publish time is still ahead (the frame groups the posts in three)'],
  ['adminStats.market.draft', 'Piszkozat', 'Draft', 'Entwurf', `${STAT}: split legend`],
  ['adminStats.market.withdrawn', 'Visszavonva', 'Withdrawn', 'Zurückgezogen', 'undrawn: split legend for a post its author withdrew (the frame groups the posts in three)'],
  ['adminStats.market.removed', 'Levéve', 'Taken down', 'Abgenommen', `${STAT}: split legend (an admin's take-down)`],
  ['adminStats.market.openReports', 'Nyitott jelentés', 'Open reports', 'Offene Meldungen', `${STAT}: line`],
  ['adminStats.market.resolved', 'Elintézett jelentés', 'Resolved reports', 'Erledigte Meldungen', `${STAT}: line`],
  ['adminStats.coaches.withClients', 'edző ügyféllel', 'coaches with clients', 'Trainer mit Klienten', `${STAT}: unit under the "2 / 3" fraction`],
  ['adminStats.coaches.perCoach', 'Ügyfél / edző', 'Clients / coach', 'Klienten / Trainer', `${STAT}: line`],
  ['adminStats.coaches.perCoachSub', 'aktív kapcsolatok átlaga', 'average of active links', 'Durchschnitt der aktiven Verbindungen', `${STAT}: its sub line`],
  ['adminStats.coaches.links', 'Aktív kapcsolat', 'Active links', 'Aktive Verbindungen', `${STAT}: line`],
  ['adminStats.system.sessions', 'aktív munkamenet', 'active sessions', 'aktive Sitzungen', `${STAT}: unit under the sessions figure`],
  ['adminStats.system.audit', 'Auditesemény', 'Audit events', 'Audit-Ereignisse', `${STAT}: line`],
  ['adminStats.system.auditSub', '24 óra', '24 hours', '24 Stunden', `${STAT}: its sub line`],
];

const set = rows.map(([key, hu, en, de, source]) => {
  const entry = { key, hu, en, de, copy: 'proposed', visible: true, source };
  if (en === hu || de === hu) entry.untranslated = { reason: 'the same word in the languages' };
  return entry;
});

const change = [
  {
    key: 'admin.queueEmptyTitle',
    hu: { from: 'Nincs mit moderálni', to: 'Nincs várakozó beküldés' },
    en: { from: 'Nothing to moderate', to: 'No submissions waiting' },
    de: { from: 'Nichts zu moderieren', to: 'Keine wartenden Einsendungen' },
    copy: 'fix',
    source: "frame admin-moderation-v2-empty: the owner's title NINCS VÁRAKOZÓ BEKÜLDÉS (design note: decide which copy wins - the frame wins)",
  },
];

// The old panel's words: the user split, the ledger line and the footer sentence are gone from AdminPage.tsx.
const remove = ['admin.footer', 'admin.users', 'admin.unit.user', 'admin.unit.exercise', 'admin.unit.media'].map((key) => ({
  key,
  reason: 'its only consumer, the UserSplit block / ledger line / footer of AdminPage.tsx, is dropped by this package (admin-moderation-v2)',
}));

fs.writeFileSync(
  new URL('./i18n.patch.json', import.meta.url),
  JSON.stringify({ package: 'S-admin-moderation', base: '966b625', namespaces: ['adminStats', 'admin'], set, change, remove }, null, 2) + '\n',
);
console.log(`${set.length} set, ${change.length} change, ${remove.length} remove`);
