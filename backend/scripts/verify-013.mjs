// scripts/verify-013.mjs — the chat and notification schema, proved rather than assumed.
//
// Every trigger and CHECK in 013 is an access-control or integrity claim, and a claim nobody has
// watched fail is not evidence. This runs the refusals: a stranger posting into a thread, a
// conversation claiming a link it does not belong to, a notification addressed outside the
// relationship it names, an absolute URL as a link target.
//
// It runs inside a transaction that is ALWAYS rolled back, so it is safe against a live database
// and leaves nothing behind.
//
// Usage: node scripts/verify-013.mjs   (wired into "npm run check:all")
import 'dotenv/config';
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../src/lib/dbkey.js';

const c = new Database(process.env.DB_PATH);
c.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
c.pragma('foreign_keys = ON');

let pass = 0;
const fail = [];
const check = (name, ok, detail = '') => {
  (ok ? pass++ : fail.push(name)) , console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
/** Run something that MUST be refused, and report the abort message. */
const refused = (name, fn) => {
  try { fn(); check(name, false, 'it was ALLOWED'); }
  catch (e) { check(name, true, String(e.message).slice(0, 62)); }
};

const link = c.prepare("SELECT id, coach_id, client_id FROM coach_clients WHERE status='active' LIMIT 1").get();
const other = c.prepare('SELECT id FROM users WHERE id NOT IN (?, ?) LIMIT 1').get(link.coach_id, link.client_id);

c.exec('BEGIN');
try {
  // A conversation whose denormalised pair does not match the link it names.
  refused('a conversation cannot claim a link it does not belong to', () =>
    c.prepare('INSERT INTO conversations (coach_client_id, coach_id, client_id) VALUES (?, ?, ?)')
      .run(link.id, other.id, link.client_id));

  const conv = c.prepare('INSERT INTO conversations (coach_client_id, coach_id, client_id) VALUES (?, ?, ?)')
    .run(link.id, link.coach_id, link.client_id).lastInsertRowid;
  check('the honest conversation inserts', !!conv);

  refused('a second conversation for the same link is refused', () =>
    c.prepare('INSERT INTO conversations (coach_client_id, coach_id, client_id) VALUES (?, ?, ?)')
      .run(link.id, link.coach_id, link.client_id));

  refused('the parties cannot be changed afterwards', () =>
    c.prepare('UPDATE conversations SET coach_id = ? WHERE id = ?').run(other.id, conv));

  // Messages.
  refused('a stranger cannot post into the thread', () =>
    c.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)')
      .run(conv, other.id, 'hello'));

  const m1 = c.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)')
    .run(conv, link.coach_id, 'first').lastInsertRowid;
  check('a party can post', !!m1);

  refused('an empty body is refused', () =>
    c.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)')
      .run(conv, link.coach_id, ''));

  refused('a 4001-character body is refused', () =>
    c.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)')
      .run(conv, link.coach_id, 'x'.repeat(4001)));

  refused('a sent message cannot be rewritten', () =>
    c.prepare('UPDATE messages SET body = ? WHERE id = ?').run('edited', m1));

  // The recomputed column.
  const touched = c.prepare('SELECT last_message_at FROM conversations WHERE id = ?').get(conv);
  check('last_message_at is recomputed on insert', touched.last_message_at != null, String(touched.last_message_at));

  c.prepare('UPDATE messages SET deleted_at = unixepoch() WHERE id = ?').run(m1);
  const afterDelete = c.prepare('SELECT last_message_at FROM conversations WHERE id = ?').get(conv);
  check('and recomputed again when the last message is withdrawn', afterDelete.last_message_at === null,
    String(afterDelete.last_message_at));

  // Block.
  c.prepare('UPDATE conversations SET blocked_at = unixepoch(), blocked_by = ? WHERE id = ?').run(link.client_id, conv);
  refused('a blocked conversation accepts nothing further', () =>
    c.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)')
      .run(conv, link.coach_id, 'after the block'));
  refused('a block cannot be recorded without an actor', () =>
    c.prepare('UPDATE conversations SET blocked_at = unixepoch(), blocked_by = NULL WHERE id = ?').run(conv));

  // Notifications.
  refused('a notification cannot be addressed outside the relationship', () =>
    c.prepare('INSERT INTO notifications (user_id, coach_client_id, type, title) VALUES (?, ?, ?, ?)')
      .run(other.id, link.id, 'chat.message', 'leak'));

  const n = c.prepare('INSERT INTO notifications (user_id, coach_client_id, type, title, link_path) VALUES (?, ?, ?, ?, ?)')
    .run(link.coach_id, link.id, 'chat.message', 'New message', '/chat/1').lastInsertRowid;
  check('an honest notification inserts', !!n);

  refused('an absolute URL cannot be a link target', () =>
    c.prepare('INSERT INTO notifications (user_id, type, title, link_path) VALUES (?, ?, ?, ?)')
      .run(link.coach_id, 'chat.message', 'evil', 'https://evil.example/steal'));
  refused('nor a protocol-relative one', () =>
    c.prepare('INSERT INTO notifications (user_id, type, title, link_path) VALUES (?, ?, ?, ?)')
      .run(link.coach_id, 'chat.message', 'evil', '//evil.example/steal'));
  refused('a notification cannot be rewritten', () =>
    c.prepare('UPDATE notifications SET title = ? WHERE id = ?').run('changed', n));

  // Reports.
  c.prepare('INSERT INTO message_reports (message_id, reporter_id, reason, body_snapshot) VALUES (?, ?, ?, ?)')
    .run(m1, link.client_id, 'abuse', 'first');
  check('a report is filed', true);
  refused('the same person cannot report the same message twice', () =>
    c.prepare('INSERT INTO message_reports (message_id, reporter_id, reason) VALUES (?, ?, ?)')
      .run(m1, link.client_id, 'spam'));
  refused('an open report cannot carry a resolution stamp', () =>
    c.prepare('INSERT INTO message_reports (message_id, reporter_id, reason, resolved_at) VALUES (?, ?, ?, unixepoch())')
      .run(m1, link.coach_id, 'spam'));

  // Push devices.
  c.prepare('INSERT INTO push_devices (user_id, platform, token_hash) VALUES (?, ?, ?)')
    .run(link.coach_id, 'ios', 'abc');
  c.prepare('INSERT INTO push_devices (user_id, platform, token_hash) VALUES (?, ?, ?)')
    .run(link.client_id, 'ios', 'abc');
  check('two users may hold the same device token hash — it is scoped to the user', true);
  refused('one user cannot register the same token twice', () =>
    c.prepare('INSERT INTO push_devices (user_id, platform, token_hash) VALUES (?, ?, ?)')
      .run(link.coach_id, 'ios', 'abc'));

  // Archiving the link must cascade the conversation away.
  const before = c.prepare('SELECT COUNT(*) n FROM conversations WHERE coach_client_id = ?').get(link.id).n;
  c.prepare('DELETE FROM coach_clients WHERE id = ?').run(link.id);
  const after = c.prepare('SELECT COUNT(*) n FROM conversations WHERE coach_client_id = ?').get(link.id).n;
  check('deleting the link takes the conversation with it', before === 1 && after === 0, `${before} -> ${after}`);
  const orphanNotifs = c.prepare('SELECT COUNT(*) n FROM notifications WHERE coach_client_id = ?').get(link.id).n;
  check('and the notifications about it', orphanNotifs === 0, String(orphanNotifs));
} finally {
  c.exec('ROLLBACK');   // a probe leaves nothing behind
  c.close();
}

console.log('');
console.log(fail.length ? `PROBE FAILED — ${pass} passed, ${fail.length} failed` : `PROBE OK — ${pass} assertions`);
process.exit(fail.length ? 1 : 0);
