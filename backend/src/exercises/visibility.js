// src/exercises/visibility.js — who may read which exercise, written once.
//
// It lived as a build-time constant in `exercises/routes.js` and as a hand-copied duplicate in
// `exercises/media.js`. Two copies of a security predicate is one copy that will eventually be
// wrong, and this change is exactly the kind that would have updated only one of them.
//
// THE BUG THIS FIXES, found by the J4 adversarial review:
//
//   A coach puts their own private exercise into a client's plan. The write side allows it —
//   `trg_log_exercise_visible_ins` in migration 010 grants read through an active prescription.
//   The READ side did not know: the client opening the library, or the exercise the plan told them
//   to do, got a 404. So a coach could prescribe a movement their client could not look up.
//
// The clause below is the same predicate as that trigger, and the two must stay identical — if a
// client may LOG an exercise they must be able to READ it, and the reverse.

/**
 * Four ways an exercise is readable, in the order they are cheapest to evaluate:
 *
 *   1. it is global — the 1652-row public dataset;
 *   2. it has no owner — a dataset row, or one whose author's account was deleted (see the
 *      `trg_user_delete_keeps_exercises` trigger: exercises are orphaned rather than destroyed,
 *      so a client's history keeps something to group by);
 *   3. the caller owns it;
 *   4. **it is prescribed to the caller through a live plan.** This is the new arm. The link must
 *      still be active for a coach-authored plan, so archiving a client withdraws the read on the
 *      very next request — the same rule the plan routes enforce.
 *
 * A row the caller may not see must be INDISTINGUISHABLE from a row that does not exist, which is
 * why every miss returns 404 rather than 403. A 403 confirms the id is real, and that is enough to
 * enumerate another coach's private library.
 *
 * Takes the caller's id TWICE. Both are the caller's own — nothing here comes from a URL.
 */
export const VISIBLE = `(
  e.deleted_at IS NULL
  AND (
    e.status = 'global'
    OR e.owner_id IS NULL
    OR e.owner_id = ?
    OR EXISTS (
         SELECT 1
           FROM workout_plan_exercises px
           JOIN workout_plans p ON p.id = px.plan_id
           LEFT JOIN coach_clients cc ON cc.id = p.coach_client_id
          WHERE px.exercise_id = e.id
            AND p.client_user_id = ?
            AND p.archived_at IS NULL
            AND p.status <> 'draft'
            AND (p.coach_client_id IS NULL OR cc.status = 'active'))
  )
)`;

/**
 * The parameters `VISIBLE` consumes, in order.
 *
 * A helper rather than a note in a comment, because the predicate now takes two placeholders and
 * every call site appends them by hand. `[...rest, userId]` silently binds the wrong column when
 * a second `?` appears, and the query still runs.
 */
export const visibleParams = (userId) => [userId, userId];
