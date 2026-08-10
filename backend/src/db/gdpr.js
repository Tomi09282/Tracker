// src/db/gdpr.js — the two operations a person may perform on their own record.
//
// ═══ WHY THIS IS ITS OWN FILE ══════════════════════════════════════════════════════════════════
//
// An export is a list of every table that holds somebody's personal data, and a deletion is a claim
// that the list is complete. Both are the SAME list, and they have to stay the same list — a table
// added to the product and to neither of these is a table whose contents are invisible to the
// person they describe and survive their erasure.
//
// So the list is written ONCE here and both operations read it, and `scripts/check-gdpr.mjs` holds
// it to the schema: every table with a foreign key into `users` is either in the list, or named in
// the exemption map with a reason.
//
// ═══ 55 COLUMNS ACROSS 41 TABLES POINT AT users(id) ════════════════════════════════════════════
//
// Measured with `pragma_foreign_key_list`, not counted by hand: 39 of them CASCADE and 16 SET NULL.
// So a plain `DELETE FROM users` does most of the work, and 018 already repaired the trigger that
// used to abort it — a person who had ever produced an audit row could not be erased at all. That
// was verified by deleting somebody: the delete succeeds, the audit row survives with `actor_id`
// NULL, and nothing anywhere still points at the gone id.
//
// What a plain DELETE gets WRONG is content the person no longer owns in any meaningful sense.

/**
 * ONE snapshot, one connection.
 *
 * Every call into the pool is a different worker thread with its own read snapshot, so an export
 * assembled from twenty pool calls is twenty moments stitched together — a workout that appears in
 * the log but not in its sets, because it was written between two of them. An export is a legal
 * artefact; it has to be one consistent read.
 *
 * Each entry is a table and the statement that selects THAT PERSON'S rows from it. Every statement
 * is bound, and every one is scoped by the caller's own id — there is no id in the request to forge.
 */
export const EXPORT_TABLES = [
  ['account', 'SELECT id, email, role, created_at, updated_at, must_change_credentials FROM users WHERE id = ?'],
  ['theme', 'SELECT pack, accent, gradient FROM user_theme_prefs WHERE user_id = ?'],
  ['onboarding', 'SELECT * FROM onboarding_profiles WHERE user_id = ?'],
  ['onboarding_equipment', 'SELECT * FROM onboarding_equipment WHERE user_id = ?'],
  ['onboarding_limitations', 'SELECT * FROM onboarding_limitations WHERE user_id = ?'],

  // ── the health data, which is a special category and the reason this exists ──────────────
  ['workout_logs', 'SELECT * FROM workout_logs WHERE client_user_id = ?'],
  ['workout_log_exercises', 'SELECT e.* FROM workout_log_exercises e JOIN workout_logs l ON l.id = e.log_id WHERE l.client_user_id = ?'],
  ['workout_log_sets', 'SELECT s.* FROM workout_log_sets s JOIN workout_log_exercises e ON e.id = s.log_exercise_id JOIN workout_logs l ON l.id = e.log_id WHERE l.client_user_id = ?'],
  ['personal_records', 'SELECT * FROM workout_pr_events WHERE client_user_id = ?'],
  ['body_measurements', 'SELECT * FROM body_measurements WHERE client_user_id = ?'],
  // Metadata only. The image bytes are not in the database and an export that promised the photos
  // and shipped their filenames would be worse than one that says what it contains.
  ['progress_photos_metadata', 'SELECT id, taken_on, pose, note, created_at FROM progress_photos WHERE client_user_id = ?'],
  ['nutrition_log', 'SELECT * FROM nutrition_log_items WHERE client_user_id = ?'],
  // `meals` has NO user column: a meal belongs to a nutrition PLAN day, not to a person. Two
  // export sections were written for it anyway and both would have thrown. The personal food log is
  // `nutrition_log_items`, above; meals reach the subject through `nutrition_plans_owned`.

  // ── the coaching relationship, from BOTH sides ────────────────────────────────────────────
  ['coach_links', 'SELECT * FROM coach_clients WHERE client_id = ? OR coach_id = ?'],
  ['teams', 'SELECT * FROM teams WHERE coach_id = ?'],
  // Both sides. A plan somebody AUTHORED and a plan assigned TO them are each their data, and a
  // client who only ever received plans would otherwise get an empty section.
  ['plans', 'SELECT * FROM workout_plans WHERE author_user_id = ? OR client_user_id = ?'],
  ['nutrition_plans', 'SELECT * FROM nutrition_plans WHERE author_user_id = ? OR client_user_id = ?'],
  // The person's OWN messages. Not the whole conversation: the other half is somebody else's
  // personal data, and an export is not a way to obtain it.
  ['messages_sent', 'SELECT id, conversation_id, body, created_at, deleted_at FROM messages WHERE sender_id = ?'],
  ['notifications', 'SELECT * FROM notifications WHERE user_id = ?'],

  // ── money and the public profile ──────────────────────────────────────────────────────────
  ['coin_wallet', 'SELECT * FROM coin_wallets WHERE user_id = ?'],
  ['coin_ledger', 'SELECT * FROM coin_ledger WHERE user_id = ?'],
  ['coin_purchases', 'SELECT * FROM coin_purchases WHERE user_id = ?'],
  ['coin_entitlements', 'SELECT * FROM coin_entitlements WHERE user_id = ?'],
  ['achievements', 'SELECT * FROM user_achievements WHERE user_id = ?'],
  ['coach_profile', 'SELECT * FROM coach_profiles WHERE user_id = ?'],
  ['coach_posts', 'SELECT * FROM coach_posts WHERE author_user_id = ?'],
  ['exercises_authored', 'SELECT * FROM exercises WHERE owner_id = ?'],
  ['guidelines_accepted', 'SELECT * FROM guidelines_acceptances WHERE user_id = ?'],
  ['calendar_feeds', 'SELECT id, created_at, revoked_at FROM workout_calendar_feeds WHERE user_id = ?'],
  // Devices, without the token hash — that is a credential, and an export is a file people email
  // to themselves.
  ['push_devices', 'SELECT id, platform, created_at FROM push_devices WHERE user_id = ?'],

  // ── what the product did TO them ──────────────────────────────────────────────────────────
  // Their own audit trail. `actor_id` only: rows where they are the TARGET may name the admin who
  // acted, and that is somebody else's record of a decision, not the subject's personal data.
  ['audit_of_my_actions', 'SELECT id, action, target_type, target_id, created_at FROM audit_log WHERE actor_id = ?'],
];

/**
 * Content that OUTLIVES the person, and why each one does.
 *
 * A deletion route built on a bare `DELETE FROM users` gets these wrong in opposite directions, and
 * both matter:
 *
 *   * `exercises.owner_id` is ON DELETE CASCADE. An exercise a coach submitted and an admin
 *     PROMOTED to the shared library still carries their id — approval does not clear it. So a
 *     coach who gets one approved and then deletes their account takes it out of the library for
 *     everybody, and every plan that referenced it keeps a row with a null exercise. Measured: all
 *     1652 seeded global exercises have no owner, so nothing is broken today — it breaks the first
 *     time a real submission is approved and its author leaves.
 *
 *     Promotion to `global` is the moment the exercise stops being the coach's and becomes the
 *     product's. So erasure unlinks it rather than destroying it, which is also what erasure MEANS:
 *     the person is unlinked from the content, the content is not rewritten. Exactly what 018 does
 *     for the audit log.
 *
 *   * Everything still `private` or `pending_review` is theirs and goes with them, by cascade.
 */
export const UNLINK_BEFORE_DELETE = [
  [
    'exercises promoted to the shared library',
    "UPDATE exercises SET owner_id = NULL WHERE owner_id = ? AND status = 'global'",
  ],
];
