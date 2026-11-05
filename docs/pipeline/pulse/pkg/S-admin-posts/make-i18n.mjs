// Writes i18n.patch.json (run: node make-i18n.mjs). Every string of the admin marketplace posts screens that
// has no key yet: hu from the approved frames (admin-market-v2 ... admin-post-detail-3) or marked as new,
// en + de written with them. Sources are named so the owner can approve the new Hungarian copy.
import fs from 'node:fs';
const FR = 'frame admin-market-v2';
const D1 = 'frame admin-post-detail-1';
const D2 = 'frame admin-post-detail-2';
const TD = 'frame admin-post-detail-2-takedown';
const RS = 'frame admin-post-detail-2-restore';
const DR = 'frame admin-post-detail-2-draft';
const D3 = 'frame admin-post-detail-3';
const NEW = 'NOT in a frame (a state or sentence the frames do not draw; proposed by this package, see copy-to-approve.md)';

// [key, hu, en, de, source]
const rows = [
  ['view.label', 'Piactér nézet', 'Marketplace view', 'Marktplatz-Ansicht', NEW + ': the accessible name of the switch'],
  ['view.reports', 'Jelentések', 'Reports', 'Meldungen', FR + '-reports: switch'],
  ['view.posts', 'Posztok', 'Posts', 'Beiträge', FR + ': switch'],
  ['search', 'Cím vagy @szerző', 'Title or @author', 'Titel oder @Autor', FR + ': the search line'],
  ['stateLabel', 'Állapot', 'State', 'Status', NEW + ': the accessible name of the state filter'],
  ['state.all', 'Mind', 'All', 'Alle', FR + ': state filter'],
  ['state.draft', 'Piszkozat', 'Draft', 'Entwurf', FR + ': state filter and tag'],
  ['state.live', 'Élő', 'Live', 'Live', FR + ': state filter and tag'],
  ['state.withdrawn', 'Visszavonva', 'Withdrawn', 'Zurückgezogen', FR + ': state filter and tag (the author withdrew it)'],
  ['state.removed', 'Levéve', 'Taken down', 'Entfernt', FR + ': state filter and tag (a moderator took it down)'],
  ['more', 'Továbbiak', 'More', 'Mehr', FR + ': paging row'],
  ['countOf', '{{shown}} / {{total}} poszt', '{{shown}} / {{total}} posts', '{{shown}} / {{total}} Beiträge', FR + ': "7 / 31 poszt"'],
  ['reportCount', '{{count}} jelentés', 'Reports: {{count}}', 'Meldungen: {{count}}', FR + ': open-report count on a row'],
  ['emptyTitle', 'Még nincs poszt', 'No posts yet', 'Noch keine Beiträge', NEW + ': empty list'],
  ['emptyBody', 'Amint egy edző közzétesz egy posztot vagy piszkozatot ment, itt jelenik meg.', 'When a coach publishes a post or saves a draft, it appears here.', 'Sobald ein Coach einen Beitrag veröffentlicht oder einen Entwurf speichert, erscheint er hier.', NEW + ': empty list'],
  ['noMatchBody', 'Próbálj másik szót, vagy válassz másik állapotot.', 'Try another word or pick another state.', 'Versuche ein anderes Wort oder wähle einen anderen Status.', NEW + ': no match under a search or filter'],
  ['errorTitle', 'Nem sikerült betölteni', 'Could not load', 'Laden fehlgeschlagen', 'sentence style of frame admin-statistics-2 (error): same title'],
  ['errorBody', 'A piactér most nem érhető el. Ellenőrizd a kapcsolatot, és próbáld újra.', 'The marketplace is not available right now. Check your connection and try again.', 'Der Marktplatz ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es erneut.', 'sentence style of frame admin-statistics-2 (error): same sentence, the subject changed'],
  ['detail.title', 'Poszt', 'Post', 'Beitrag', D1 + ': display title'],
  ['detail.goneTitle', 'Ez a poszt nem található', 'This post was not found', 'Dieser Beitrag wurde nicht gefunden', NEW + ': 404 on the post page'],
  ['detail.goneBody', 'Lehet, hogy már nem létezik, vagy hibás a hivatkozás.', 'It may no longer exist, or the link is wrong.', 'Er existiert möglicherweise nicht mehr, oder der Link ist falsch.', NEW + ': 404 on the post page'],
  ['detail.privateDraft', 'Nem nyilvános · csak a szerző látja.', 'Not public · only the author sees it.', 'Nicht öffentlich · nur der Autor sieht ihn.', DR + ': under the title'],
  ['detail.authorOff', 'A szerző le van tiltva, ezért a poszt nem látszik.', 'The author is disabled, so the post is not shown.', 'Der Autor ist gesperrt, deshalb wird der Beitrag nicht angezeigt.', D3 + ' says "...de a posztja még látszik."; changed because the server hides the posts of a disabled author (B-admin-posts api.md section 3)'],
  ['detail.notShown', 'A poszt most nem látszik a nyilvános oldalon.', 'The post is not shown on the public page right now.', 'Der Beitrag wird auf der öffentlichen Seite gerade nicht angezeigt.', NEW + ': the post is live but something else hides it (author demoted, profile unpublished or removed)'],
  ['facts.title', 'Adatok', 'Details', 'Daten', D1 + ': section'],
  ['facts.readOnly', 'csak olvasható', 'read only', 'nur lesbar', D1 + ': section note'],
  ['facts.kind', 'Fajta', 'Kind', 'Art', D1 + ': row'],
  ['facts.time', 'Időpont', 'Time', 'Zeitpunkt', D1 + ': row'],
  ['facts.capacity', 'Férőhely', 'Capacity', 'Plätze', D1 + ': row'],
  ['facts.seats', '{{count}} hely', '{{count}} seats', '{{count}} Plätze', D1 + ': "16 hely"'],
  ['facts.price', 'Ár', 'Price', 'Preis', D1 + ': row'],
  ['author.title', 'Szerző', 'Author', 'Autor', D1 + ': section'],
  ['author.disabled', 'Letiltva', 'Disabled', 'Deaktiviert', D3 + ': tag on the author row'],
  ['timeline.title', 'Állapot', 'Status', 'Status', D1 + ': section'],
  ['timeline.created', 'Létrehozva', 'Created', 'Erstellt', D1 + ': step'],
  ['timeline.published', 'Közzétéve', 'Published', 'Veröffentlicht', D1 + ': step'],
  ['timeline.withdrawn', 'Visszavonva', 'Withdrawn', 'Zurückgezogen', NEW + ': the author withdrew the post (the frames do not draw a withdrawn page; the list does)'],
  ['timeline.removed', 'Levéve', 'Taken down', 'Entfernt', D2 + ': step "Levéve · Takács Dániel"'],
  ['timeline.reason', 'Indok: {{reason}}', 'Reason: {{reason}}', 'Grund: {{reason}}', D2 + ': step detail'],
  ['timeline.notPublished', 'Még nincs közzétéve.', 'Not published yet.', 'Noch nicht veröffentlicht.', DR + ': step detail'],
  ['removed.reason', 'Indok', 'Reason', 'Grund', D2 + ': banner'],
  ['restore.action', 'Visszaállítás', 'Restore', 'Wiederherstellen', D2 + ': pill and sheet link'],
  ['restore.hint', 'A poszt újra megjelenik a nyilvános oldalon.', 'The post will show on the public page again.', 'Der Beitrag erscheint wieder auf der öffentlichen Seite.', D2 + ': under the pill'],
  ['restore.title', 'Visszaállítod a posztot?', 'Restore the post?', 'Beitrag wiederherstellen?', RS + ': sheet title'],
  ['restore.message', 'A poszt újra megjelenik a nyilvános oldalon, a szerző profilján és a piactéren.', 'The post will show again on the public page, on the author’s profile and in the marketplace.', 'Der Beitrag erscheint wieder auf der öffentlichen Seite, im Profil des Autors und auf dem Marktplatz.', RS + ': sheet sentence'],
  ['restore.messageHidden', 'A poszt visszaáll, de a nyilvános oldalon még nem látszik: a szerző vagy a profilja miatt.', 'The post is restored, but it still does not show on the public page: because of the author or their profile.', 'Der Beitrag wird wiederhergestellt, ist auf der öffentlichen Seite aber noch nicht sichtbar: wegen des Autors oder seines Profils.', NEW + ': restore sheet when something else still hides the post (the server says so in the restore answer)'],
  ['body.title', 'Szöveg', 'Text', 'Text', D1 + ': section'],
  ['body.full', 'Teljes szöveg', 'Full text', 'Ganzer Text', D1 + ': link'],
  ['media.title', 'Média', 'Media', 'Medien', D1 + ': section'],
  ['media.count', '{{count}} kép', '{{count}} images', '{{count}} Bilder', D1 + ': section note'],
  ['media.cover', 'Borító', 'Cover', 'Titelbild', D1 + ': caption'],
  ['media.nth', '{{n}}. kép', 'Image {{n}}', 'Bild {{n}}', D1 + ': caption'],
  ['reports.title', 'Jelentések', 'Reports', 'Meldungen', D1 + ': section'],
  ['reports.open', '{{count}} nyitott', '{{count}} open', '{{count}} offen', D1 + ': section note'],
  ['reports.closed', '{{count}} lezárt', '{{count}} closed', '{{count}} abgeschlossen', D2 + ': section note'],
  ['reports.both', '{{open}} nyitott / {{closed}} lezárt', '{{open}} open / {{closed}} closed', '{{open}} offen / {{closed}} abgeschlossen', 'designers’ note ("N nyitott / N lezárt"): open and closed reports on one post'],
  ['reports.severity', 'Súlyosság', 'Severity', 'Schweregrad', D1 + ': bar label'],
  ['reports.upholdAndTakeDown', 'Helybenhagyás és levétel', 'Uphold and take down', 'Bestätigen und entfernen', D1 + ': link'],
  ['reports.upheld', 'Helybenhagyva', 'Upheld', 'Bestätigt', D2 + ': closed report'],
  ['reports.rejected', 'Elutasítva', 'Rejected', 'Abgelehnt', D2 + ': closed report'],
  ['manage.title', 'Kezelés', 'Manage', 'Verwalten', D1 + ': section'],
  ['manage.postSub', 'Nyilvánosan eltűnik. Visszaállítható.', 'Disappears from the public page. Can be restored.', 'Verschwindet von der öffentlichen Seite. Kann wiederhergestellt werden.', D1 + ': row sub line'],
  ['manage.profileSub', 'Posztjai is eltűnnek.', 'Their posts disappear too.', 'Ihre Beiträge verschwinden ebenfalls.', D1 + ' says "Posztjai is eltűnnek. Visszaállítható."; the second sentence is dropped: no screen or route restores a profile'],
  ['manage.draftNote', 'A piszkozat nem nyilvános, így nincs mit levenni.', 'A draft is not public, so there is nothing to take down.', 'Ein Entwurf ist nicht öffentlich, es gibt also nichts zu entfernen.', DR + ': note'],
  ['takedown.post.title', 'Poszt levétele', 'Take down post', 'Beitrag entfernen', TD + ': sheet title and link, row title'],
  ['takedown.post.message', 'A poszt eltűnik a nyilvános oldalról. Később visszaállíthatod.', 'The post disappears from the public page. You can restore it later.', 'Der Beitrag verschwindet von der öffentlichen Seite. Du kannst ihn später wiederherstellen.', TD + ': sheet sentence'],
  ['takedown.profile.title', 'Szerző profiljának levétele', 'Take down author profile', 'Autorenprofil entfernen', D1 + ': row title; the sheet reuses it'],
  ['takedown.profile.message', 'A profil és a posztjai eltűnnek a nyilvános oldalról.', 'The profile and its posts disappear from the public page.', 'Das Profil und seine Beiträge verschwinden von der öffentlichen Seite.', NEW + ': the sheet of the profile take-down (the frames draw only the post sheet)'],
  ['takedown.both.title', 'Poszt és szerzői profil levétele együtt', 'Take down post and author profile together', 'Beitrag und Autorenprofil zusammen entfernen', D3 + ': link and sheet title'],
  ['takedown.both.message', 'A poszt és a szerző profilja is eltűnik a nyilvános oldalról.', 'The post and the author’s profile both disappear from the public page.', 'Der Beitrag und das Profil des Autors verschwinden beide von der öffentlichen Seite.', NEW + ': the sheet of the coordinated take-down'],
  ['takedown.report.title', 'Helybenhagyás és levétel', 'Uphold and take down', 'Bestätigen und entfernen', D1 + ': the link of a report opens the same sheet (designers’ note 6)'],
  ['takedown.report.message', 'A bejelentés helybenhagyva, a poszt eltűnik a nyilvános oldalról. Később visszaállíthatod.', 'The report is upheld and the post disappears from the public page. You can restore it later.', 'Die Meldung wird bestätigt und der Beitrag verschwindet von der öffentlichen Seite. Du kannst ihn später wiederherstellen.', NEW + ': the sheet of an upheld report'],
  ['takedown.reason', 'Levétel indoka', 'Reason for taking down', 'Grund der Entfernung', TD + ': field'],
  ['takedown.reasonHint', 'Kötelező. Az audit-naplóba kerül, a szerző nem látja.', 'Required. It goes into the audit log; the author does not see it.', 'Pflichtfeld. Es kommt ins Audit-Log; der Autor sieht es nicht.', TD + ': field hint'],
];

const set = rows.map(([k, hu, en, de, source]) => ({
  key: `adminPosts.${k}`, hu, en, de,
  copy: 'proposed', visible: true, source,
}));
fs.writeFileSync(new URL('./i18n.patch.json', import.meta.url), JSON.stringify({ package: 'S-admin-posts', base: '966b625', namespaces: ['adminPosts'], set }, null, 2) + '\n');
console.log(set.length, 'keys');
