// Writes i18n.patch.json (run: node make-i18n.mjs). The fix round for the three admin screens: the strings the
// independent reviews (.pulse/review/S-admin-accounts, S-admin-posts, S-admin-moderation) made necessary.
// Nothing here is drawn in a frame: every string is marked "undrawn" with the review item that needs it.
import fs from 'node:fs';

const RA = 'review S-admin-accounts';
const RP = 'review S-admin-posts';
const RM = 'review S-admin-moderation';

const rows = [
  // [key, hu, en, de, source]
  // ── accounts ──
  ['adminUsers.audit.other', 'Egyéb esemény', 'Other event', 'Anderes Ereignis', `undrawn: ${RA} item 2 - an audit action without its own line never prints a machine code`],
  ['adminUsers.err.offline', 'Nincs kapcsolat, ezért a módosítás nem mentődött el.', 'You are offline, so the change was not saved.', 'Du bist offline, deshalb wurde die Änderung nicht gespeichert.', `undrawn: ${RA} item 1 - a write is never queued for a reconnect; it fails at once and says so`],
  ['adminUsers.enable.adminMessage', '{{name}} újra beléphet, és az admin jogát is visszakapja. Ehhez add meg a saját jelszavad.', '{{name}} can sign in again and gets the admin role back. Enter your own password to confirm.', '{{name}} kann sich wieder anmelden und erhält die Admin-Rolle zurück. Gib dazu dein eigenes Passwort ein.', `undrawn: ${RA} item 14 - the enable sheet of a disabled ADMIN (B-admin-polish H1 asks for the actor's password)`],
  ['adminUsers.enable.passwordHint', 'Letiltott admint csak a saját jelszavad megadásával engedélyezhetsz.', 'A disabled admin can only be enabled with your own password.', 'Einen deaktivierten Admin kannst du nur mit deinem eigenen Passwort aktivieren.', `undrawn: ${RA} item 14 - hint under the password field (the role sheet's wording: roleSheet.passwordHint)`],
  ['adminUsers.replayed.disable', 'Ez a fiók már le volt tiltva, ezért nem változott semmi.', 'This account was already disabled, so nothing changed.', 'Dieses Konto war bereits deaktiviert, daher hat sich nichts geändert.', `undrawn: ${RA} item 10 - another admin was first; the server answers replayed`],
  ['adminUsers.replayed.enable', 'Ez a fiók már engedélyezve volt, ezért nem változott semmi.', 'This account was already enabled, so nothing changed.', 'Dieses Konto war bereits aktiviert, daher hat sich nichts geändert.', `undrawn: ${RA} item 10 - another admin was first; the server answers replayed`],
  // ── moderation ──
  ['admin.pendingShown', '{{shown}} / {{total}} várakozik', '{{shown}} / {{total}} waiting', '{{shown}} / {{total}} warten', `undrawn: ${RM} item 4 - the queue route lists a first page only; the head says how many of the waiting rows the list holds`],
  ['admin.queueCapped', 'Az első {{count}} beküldést látod. Ha döntöttél, jön a következő.', 'You see the first {{count}} submissions. The next ones follow as you decide.', 'Du siehst die ersten {{count}} Einreichungen. Die weiteren folgen, sobald du entscheidest.', `undrawn: ${RM} item 4 - under the list when more wait than it holds`],
  ['admin.decideFailed', 'A döntés nem ment át. Próbáld újra.', 'The decision did not go through. Try again.', 'Die Entscheidung ist nicht angekommen. Versuche es erneut.', `undrawn: ${RM} item 2 - a decision is never queued while offline; a failed one says so`],
  ['admin.decideOffline', 'Nincs kapcsolat, a döntés nem ment át.', 'You are offline, the decision did not go through.', 'Du bist offline, die Entscheidung ist nicht angekommen.', `undrawn: ${RM} item 2 - the same, with the connection off`],
  // ── posts ──
  ['admin.marketplace.reportersOne', '{{count}} különböző bejelentő', '{{count}} different reporter', '{{count}} meldende Person', `undrawn: ${RP} item 11 - the singular ("1 different reporters" in English)`],
  ['adminPosts.openPost', 'Poszt megnyitása', 'Open post', 'Beitrag öffnen', `undrawn: ${RP} item 10 - the report page links to the post's inspect page`],
  ['adminPosts.detail.profileOff', 'A szerző profilját levették, ezért a poszt nem látszik.', 'The author’s profile was taken down, so the post is not shown.', 'Das Profil des Autors wurde entfernt, deshalb wird der Beitrag nicht angezeigt.', `undrawn: ${RP} item 2 - the notice names the profile take-down, not only a disabled author`],
];

const change = [
  // [key, [huFrom, huTo], [enFrom, enTo], [deFrom, deTo], source]
  ['admin.legend.coaches', ['Edzők', 'Edzők'], ['Coaches', 'Coaches'], ['Coaches', 'Trainer'], `${RM} item 6 - de: the users block said "Coaches" while the rest of the pages say "Trainer" (hu / en unchanged)`],
  ['adminStats.panel.workouts', ['Edzés ma\n/ 7 nap', 'Edzés ma\n/ 7 nap'], ['Workouts today\n/ 7 days', 'Workouts today\n/ 7 days'], ['Training heute\n/ 7 Tage', 'Sport heute\n/ 7 Tage'], `${RM} item 11 - de: "TRAINING HEUTE" is 14 mono capitals and wraps the caption to three lines at 360 pt (the frame caps a caption at two); "Sport heute" fits (hu / en unchanged)`],
  ['admin.marketplace.upholdAndRemove', ['Helybenhagyás és eltávolítás', 'Helybenhagyás és levétel'], ['Uphold and remove', 'Uphold and take down'], ['Bestätigen und entfernen', 'Bestätigen und entfernen'], `${RP} item 10 - ONE word for the act on both pages that open a report (the post page already says "levétel" / "take down")`],
  ['admin.marketplace.removalReason', ['Eltávolítás indoka', 'Levétel indoka'], ['Reason for removal', 'Reason for taking down'], ['Grund für die Entfernung', 'Grund der Entfernung'], `${RP} item 10 - the same words as adminPosts.takedown.reason`],
  ['admin.marketplace.reasonRequired', ['Eltávolításhoz indok kell.', 'Levételhez indok kell.'], ['A removal needs a reason.', 'Taking it down needs a reason.'], ['Eine Entfernung braucht einen Grund.', 'Eine Entfernung braucht einen Grund.'], `${RP} item 10`],
  ['adminPosts.manage.profileSub', ['Posztjai is eltűnnek.', 'Posztjai is eltűnnek. Nem vonható vissza.'], ['Their posts disappear too.', 'Their posts disappear too. Cannot be undone.'], ['Ihre Beiträge verschwinden ebenfalls.', 'Ihre Beiträge verschwinden ebenfalls. Nicht rückgängig zu machen.'], `${RP} item 2 - the frame says "Visszaállítható."; the server has one restore route, for a post, so the row says the truth`],
  ['adminPosts.takedown.profile.message', ['A profil és a posztjai eltűnnek a nyilvános oldalról.', 'A profil és a posztjai eltűnnek a nyilvános oldalról. Ezt itt nem lehet visszavonni.'], ['The profile and its posts disappear from the public page.', 'The profile and its posts disappear from the public page. This cannot be undone here.'], ['Das Profil und seine Beiträge verschwinden von der öffentlichen Seite.', 'Das Profil und seine Beiträge verschwinden von der öffentlichen Seite. Das lässt sich hier nicht rückgängig machen.'], `${RP} item 2 - the sheet that takes a whole profile off says there is no way back`],
  ['adminPosts.takedown.both.message', ['A poszt és a szerző profilja is eltűnik a nyilvános oldalról.', 'A poszt és a szerző profilja is eltűnik a nyilvános oldalról. A poszt később visszaállítható, a profil itt nem.'], ['The post and the author’s profile both disappear from the public page.', 'The post and the author’s profile both disappear from the public page. The post can be restored later, the profile not here.'], ['Der Beitrag und das Profil des Autors verschwinden beide von der öffentlichen Seite.', 'Der Beitrag und das Profil des Autors verschwinden beide von der öffentlichen Seite. Der Beitrag lässt sich später wiederherstellen, das Profil hier nicht.'], `${RP} item 2`],
];

const set = rows.map(([key, hu, en, de, source]) => ({ key, hu, en, de, copy: 'proposed', visible: true, source }));
const changes = change
  .map(([key, h, e, d, source]) => ({
    key,
    ...(h[0] !== h[1] ? { hu: { from: h[0], to: h[1] } } : {}),
    ...(e[0] !== e[1] ? { en: { from: e[0], to: e[1] } } : {}),
    ...(d[0] !== d[1] ? { de: { from: d[0], to: d[1] } } : {}),
    copy: 'proposed',
    visible: true,
    source,
  }));

fs.writeFileSync(
  new URL('./i18n.patch.json', import.meta.url),
  JSON.stringify({ package: 'S-admin-fix', base: '7197950', namespaces: ['adminUsers', 'admin', 'adminPosts', 'adminStats'], set, change: changes, remove: [] }, null, 2) + '\n',
);
console.log(`i18n.patch.json: ${set.length} set, ${changes.length} change`);
