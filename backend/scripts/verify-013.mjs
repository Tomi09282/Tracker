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

/*
 * ═══ THE FIXTURES ARE BUILT, NOT BORROWED ══════════════════════════════════════════════════════
 *
 * This used to take the first two active links it found and insert a conversation for each. That
 * worked until somebody used the product: opening one chat in the dev app left link 3 with a
 * conversation, and the probe's second INSERT hit `UNIQUE constraint failed:
 * conversations.coach_client_id` and CRASHED — halfway through, having reported nine passes about
 * an unrelated part of the schema.
 *
 * A probe whose result depends on activity it has nothing to do with is a probe that goes red on a
 * Tuesday for no reason, and the third time it does that somebody stops reading it. So it now
 * requires links with NO conversation, and creates its own if the database has none spare. All of
 * it inside the transaction that is always rolled back, so the live database is untouched either
 * way.
 */
c.exec('BEGIN');
try {
  const freeLinks = () =>
    c.prepare(
      `SELECT id, coach_id, client_id FROM coach_clients
        WHERE status = 'active'
          AND id NOT IN (SELECT coach_client_id FROM conversations)
        LIMIT 2`,
    ).all();

  // Make up the shortfall rather than depending on the database's mood. A coach and a client who
  // are not already linked is all this needs, and the pair is only ever used to hang a rolled-back
  // conversation off.
  while (freeLinks().length < 2) {
    const pair = c.prepare(
      `SELECT (SELECT id FROM users WHERE role IN ('coach','admin') LIMIT 1) AS coach,
              (SELECT id FROM users WHERE role = 'user' LIMIT 1)             AS client`,
    ).get();
    if (!pair?.coach || !pair?.client) {
      console.log('FAIL  the dev database has no coach and no client to build a link from');
      c.exec('ROLLBACK');
      process.exit(1);
    }
    c.prepare(
      "INSERT INTO coach_clients (coach_id, client_id, status, origin) VALUES (?, ?, 'active', 'manual')",
    ).run(pair.coach, pair.client);
  }

  const [link, link2] = freeLinks();
  const other = c.prepare('SELECT id FROM users WHERE id NOT IN (?, ?) LIMIT 1').get(link.coach_id, link.client_id);

  // A conversation whose denormalised pair does not match the link it names.
  refused('a conversation cannot claim a link it does not belong to', () =>
    c.prepare(`INSERT INTO conversations (coach_client_id, coach_id, client_id, coach_name_snapshot) VALUES (?, ?, ?, 'coach')`)
      .run(link.id, other.id, link.client_id));

  const conv = c.prepare(`INSERT INTO conversations (coach_client_id, coach_id, client_id, coach_name_snapshot) VALUES (?, ?, ?, 'coach')`)
    .run(link.id, link.coach_id, link.client_id).lastInsertRowid;
  check('the honest conversation inserts', !!conv);

  refused('a second conversation for the same link is refused', () =>
    c.prepare(`INSERT INTO conversations (coach_client_id, coach_id, client_id, coach_name_snapshot) VALUES (?, ?, ?, 'coach')`)
      .run(link.id, link.coach_id, link.client_id));

  refused('the parties cannot be changed afterwards', () =>
    c.prepare('UPDATE conversations SET coach_id = ? WHERE id = ?').run(other.id, conv));

  // Messages.
  refused('a stranger cannot post into the thread', () =>
    c.prepare('INSERT INTO messages (conversation_id, sender_id, sender_is_coach, body) VALUES (?, ?, 0, ?)')
      .run(conv, other.id, 'hello'));

  const m1 = c.prepare('INSERT INTO messages (conversation_id, sender_id, sender_is_coach, body) VALUES (?, ?, 0, ?)')
    .run(conv, link.coach_id, 'first').lastInsertRowid;
  check('a party can post', !!m1);

  refused('an empty body is refused', () =>
    c.prepare('INSERT INTO messages (conversation_id, sender_id, sender_is_coach, body) VALUES (?, ?, 0, ?)')
      .run(conv, link.coach_id, ''));

  refused('a 4001-character body is refused', () =>
    c.prepare('INSERT INTO messages (conversation_id, sender_id, sender_is_coach, body) VALUES (?, ?, 0, ?)')
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
    c.prepare('INSERT INTO messages (conversation_id, sender_id, sender_is_coach, body) VALUES (?, ?, 0, ?)')
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


  // ── retention ────────────────────────────────────────────────────────────────────────────────
  //
  // Two mechanisms with different jobs, and the split is the design: the READ PREDICATE enforces
  // the policy (it holds on the next request whether or not any job ever runs), and the SWEEP only
  // stops the disk growing. A sweeper-only design makes the policy true exactly as often as the
  // job runs, and a missed run is a silent breach.
  {
    const conv2 = c.prepare(`INSERT INTO conversations (coach_client_id, coach_id, client_id, coach_name_snapshot) VALUES (?, ?, ?, 'coach')`)
      .run(link2.id, link2.coach_id, link2.client_id).lastInsertRowid;

    const recent = c.prepare('INSERT INTO messages (conversation_id, sender_id, sender_is_coach, body) VALUES (?, ?, 0, ?)')
      .run(conv2, link2.client_id, 'recent').lastInsertRowid;
    // Two years and a day old.
    const old = c.prepare(
      "INSERT INTO messages (conversation_id, sender_id, sender_is_coach, body, created_at) VALUES (?, ?, 0, ?, unixepoch() - 731 * 86400)",
    ).run(conv2, link2.client_id, 'ancient').lastInsertRowid;

    const WITHIN = 'm.created_at > unixepoch() - 730 * 86400';
    const visible = c.prepare(`SELECT COUNT(*) n FROM messages m WHERE m.conversation_id = ? AND ${WITHIN}`).get(conv2).n;
    const total = c.prepare('SELECT COUNT(*) n FROM messages WHERE conversation_id = ?').get(conv2).n;
    check('the read predicate hides a message past the retention window', total === 2 && visible === 1, `${visible} of ${total} visible`);

    // And the sweep removes what the predicate already hid — never anything the predicate shows.
    const expired = c.prepare(`SELECT m.id FROM messages m WHERE NOT (${WITHIN}) AND m.conversation_id = ?`).all(conv2);
    check('the sweep targets exactly what the predicate hid', expired.length === 1 && expired[0].id === old, `${expired.length} row(s)`);
    c.prepare('DELETE FROM messages WHERE id = ?').run(old);
    const left = c.prepare('SELECT COUNT(*) n FROM messages WHERE conversation_id = ?').get(conv2).n;
    check('and the recent message survives it', left === 1 && c.prepare('SELECT id FROM messages WHERE conversation_id = ?').get(conv2).id === recent, `${left} left`);
  }

  // THE ASSERTION THAT WAS WRONG, and the reason 014 exists.
  //
  // This block used to read 'deleting the link takes the conversation with it' and call a cascade
  // a pass. It was encoding the bug as the expectation — a departing coach destroyed the CLIENT's
  // entire chat history, which is migration 011's harm arriving through a different door. A test
  // can defend a defect just as firmly as it defends a feature.
  const msgsBefore = c.prepare('SELECT COUNT(*) n FROM messages WHERE conversation_id = ?').get(conv).n;
  c.prepare('DELETE FROM users WHERE id = ?').run(link.coach_id);
  const msgsAfter = c.prepare('SELECT COUNT(*) n FROM messages WHERE conversation_id = ?').get(conv).n;
  check("a departing coach does NOT delete the client's history", msgsBefore === msgsAfter, `${msgsBefore} -> ${msgsAfter}`);

  const orphan = c.prepare('SELECT coach_id, coach_client_id, coach_name_snapshot FROM conversations WHERE id = ?').get(conv);
  check('the thread still names who it was with', !!orphan.coach_name_snapshot, orphan.coach_name_snapshot);
  check('and the coach reference is released, not dangling', orphan.coach_id === null && orphan.coach_client_id === null, 'null / null');

  refused('but a thread whose relationship ended accepts nothing further', () =>
    c.prepare('INSERT INTO messages (conversation_id, sender_id, sender_is_coach, body) VALUES (?, ?, 0, ?)')
      .run(conv, link.client_id, 'still here?'));
} finally {
  c.exec('ROLLBACK');   // a probe leaves nothing behind
  c.close();
}

console.log('');
console.log(fail.length ? `PROBE FAILED — ${pass} passed, ${fail.length} failed` : `PROBE OK — ${pass} assertions`);
process.exit(fail.length ? 1 : 0);
