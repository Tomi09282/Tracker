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
  // `display_name` is in here because the user TYPED it. The gate above checks tables, not
  // columns, so a new column on an already-exported table is exactly the kind of personal
  // data that can be added without anything going red — this list is the only thing watching.
  ['account', 'SELECT id, email, display_name, role, created_at, updated_at, must_change_credentials FROM users WHERE id = ?'],
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

  /*
   * ═══ AND WHAT IS ACTUALLY IN THOSE PLANS ═════════════════════════════════════════════════════
   *
   * The two lines above ship plan HEADERS — a name, a date, a status. For a while that was the
   * whole of it, so a coach who exercised their right of access received eleven plan names with
   * nothing inside them. Measured on a real account before this was added:
   *
   *     EXPORTED      workout_plans                11 rows
   *     NOT EXPORTED  workout_plan_days            15
   *                   workout_plan_blocks          14
   *                   workout_plan_exercises       16
   *                   nutrition_plan_days           1
   *
   * Forty-six rows of the person's actual training programme, absent from the file that is supposed
   * to BE their data. An export that lists the covers of the books is not an export.
   *
   * Each is scoped through its parent plan rather than by a user column, because these tables have
   * none — a plan day belongs to a plan, and the plan belongs to the person. Same both-sides rule
   * as the headers: authored or assigned.
   */
  ['plan_days', `SELECT d.* FROM workout_plan_days d JOIN workout_plans p ON p.id = d.plan_id
                  WHERE p.author_user_id = ? OR p.client_user_id = ?`],
  ['plan_blocks', `SELECT b.* FROM workout_plan_blocks b JOIN workout_plans p ON p.id = b.plan_id
                    WHERE p.author_user_id = ? OR p.client_user_id = ?`],
  ['plan_exercises', `SELECT x.* FROM workout_plan_exercises x JOIN workout_plans p ON p.id = x.plan_id
                       WHERE p.author_user_id = ? OR p.client_user_id = ?`],
  // Straight off `plan_id` like its siblings — the first draft joined through
  // `workout_plan_exercises` on a `plan_exercise_id` column that does not exist (it is
  // `exercise_row_id`, and the table carries `plan_id` directly anyway). `check-gdpr` refused it
  // before it could ship, which is the whole reason that gate PREPARES every statement rather than
  // eyeballing the list: six of these were broken the same way when it was written.
  ['plan_set_targets', `SELECT s.* FROM workout_plan_set_targets s JOIN workout_plans p ON p.id = s.plan_id
                         WHERE p.author_user_id = ? OR p.client_user_id = ?`],
  ['plan_day_exceptions', `SELECT e.* FROM workout_plan_day_exceptions e JOIN workout_plans p ON p.id = e.plan_id
                            WHERE p.author_user_id = ? OR p.client_user_id = ?`],
  ['nutrition_plan_days', `SELECT d.* FROM nutrition_plan_days d JOIN nutrition_plans p ON p.id = d.plan_id
                            WHERE p.author_user_id = ? OR p.client_user_id = ?`],
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
  // What a coach is paying for, without the processor's two identifiers. `provider_customer_id`
  // and `provider_subscription_id` address a record inside Stripe, not inside this product: they
  // are useless to the subject and they are exactly the pair somebody needs to sound legitimate
  // on a support call. Same reasoning as the feed token and the device hash directly above.
  // The row itself is ON DELETE CASCADE, so erasure was already answered by the schema — this
  // closes the other half, which is that they could not SEE it.
  [
    'subscription',
    'SELECT tier_key, status, current_period_end, updated_at FROM coach_subscriptions WHERE coach_id = ?',
  ],

  // ── what the product did TO them ──────────────────────────────────────────────────────────
  // Their own audit trail. `actor_id` only: rows where they are the TARGET may name the admin who
  // acted, and that is somebody else's record of a decision, not the subject's personal data.
  ['audit_of_my_actions', 'SELECT id, action, target_type, target_id, created_at FROM audit_log WHERE actor_id = ?'],
];

/**
 * Content that OUTLIVES the person.
 *
 * ═══ THIS LIST IS EMPTY, AND IT HELD A STEP THAT DID NOTHING ═══════════════════════════════════
 *
 * It carried one entry: null `exercises.owner_id` for the person's `global` exercises before the
 * delete, on the reasoning that `exercises.owner_id` is ON DELETE CASCADE (it is — checked with
 * `pragma_foreign_key_list`) and that a coach with a PROMOTED exercise would otherwise take it out
 * of the shared library on their way out.
 *
 * That defect is real and it was fixed in PHASE 1. Migration 011 installs
 * `trg_user_delete_keeps_exercises`, a BEFORE DELETE trigger on `users` that nulls `owner_id` for
 * every exercise they authored — before the cascade can fire, for every status, not just `global`.
 * Its own header explains the chain it protects: the logs keep their `exercise_id`, so a client's
 * progress graph and record book keep resolving after their coach leaves.
 *
 * Measured, by deleting somebody with no unlink step at all:
 *
 *     unlink2-global    global    owner=null
 *     unlink2-private   private   owner=null
 *
 * So the step was a second implementation of something the schema already did — this project's
 * second-most-common defect, written here by somebody who had spent the day finding it elsewhere.
 *
 * The list stays, empty and named, because the NEXT thing that genuinely needs unlinking has an
 * obvious home — and because `check-gdpr` now reads triggers as well as foreign keys, so a step
 * that duplicates one is refused rather than merely unnecessary.
 *
 * ═══ AND WHAT 011 DECIDED ABOUT PRIVATE ROWS IS DELIBERATE ═════════════════════════════════════
 *
 * A departing person's `private` and `pending_review` exercises SURVIVE, ownerless. That reads like
 * an erasure gap and 011 argues it out: `status` is left alone, so a private exercise stays private,
 * and the visibility predicate needs `status = 'global'` or a matching owner — NULL matches nobody.
 * The row is unreadable by every user in the product. Changing that is a Phase-1 decision to reopen
 * with evidence, not something to quietly override from here.
 */
export const UNLINK_BEFORE_DELETE = [];
