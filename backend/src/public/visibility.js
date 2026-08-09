// src/public/visibility.js — THE ONE ANSWER TO "WHO CAN SEE THIS", AND IT TAKES NO VIEWER.
//
// ═══ IT BINDS ZERO PARAMETERS, AND THAT IS THE WHOLE POINT ═════════════════════════════════════
//
// Every clause below is a fact about the ROW. Not about who is asking, not about a block list, not
// about a session. `PUBLIC_POST` and `PUBLIC_PROFILE` are pure functions of the data.
//
// That property was bought by cutting comments, and it pays for itself immediately:
//
//   * There is no block-oracle class, because there is no block to leak the existence of.
//   * There is no `Vary: Cookie` correctness hazard — a public response is the same response for
//     everybody, so it can be cached without a way to get it wrong.
//   * There is no parameter-arity bug, which the review found in one design where the same
//     predicate string was composed with four placeholders in one query and two in another.
//   * There is no `optionalAuth` middleware — new code on the auth path with two undecided
//     behaviours and no precedent in this codebase to copy.
//
// The public router never reads `req.user`. A gate asserts that.
//
// ═══ DENY-SHAPED, WHICH IS THE INVERSE OF `exercises/visibility.js` ════════════════════════════
//
// `VISIBLE` there is a grant: an OR of ways a row becomes readable. This is an AND of requirements
// a row must meet. The difference is deliberate and worth naming, because the two files sit beside
// each other: a private library defaults to hidden and grants access, a public surface defaults to
// hidden and REMOVES the reasons to hide.
//
// `exercises/visibility.js` exists because a hand-copied duplicate of a security predicate had
// already drifted and broken a client's read. This file is that lesson applied BEFORE the drift.

/**
 * A post an anonymous visitor may read. Composed by: the latest feed, the by-city feed, the
 * by-kind feed, search, a coach's post grid, the single-post read and the public media serve.
 *
 * `p` and `c` are the required aliases — `coach_posts p` joined to `coach_profiles c`.
 *
 *   published_at IS NOT NULL   a draft is not public, and its id is not an oracle for one
 *   deleted_at IS NULL         the author took it down
 *   removed_at IS NULL         a moderator took it down; separate from the above so an appeal can
 *                              tell the two apart, and so the 3am button does not look like a
 *                              delete in the audit trail
 *   c.published_at IS NOT NULL a post by an unpublished profile has no author page to sit on
 *   c.removed_at IS NULL       REMOVING A COACH REMOVES THEIR POSTS, on the next read, with no
 *                              sweep. This is the clause a "delete their rows" design gets wrong:
 *                              a sweep leaves a window, and the window is exactly when it matters.
 */
export const PUBLIC_POST = `(
  p.published_at IS NOT NULL
  AND p.deleted_at IS NULL
  AND p.removed_at IS NULL
  AND c.published_at IS NOT NULL
  AND c.removed_at IS NULL
)`;

/** A profile an anonymous visitor may read. Alias: `coach_profiles c`. */
export const PUBLIC_PROFILE = `(
  c.published_at IS NOT NULL
  AND c.removed_at IS NULL
)`;

/**
 * Whether an account may put something on the open internet, as ONE statement.
 *
 * ═══ WHY THIS IS A PROJECTION AND NOT A PREDICATE ══════════════════════════════════════════════
 *
 * `PUBLIC_POST` above is a filter: a row either survives it or is not there, and a reader has no
 * business knowing which clause hid it. Standing is the opposite problem. A coach who cannot
 * publish has to be told WHY, because every reason is something they can act on — accept the new
 * guidelines, wait until the account is old enough, publish the profile first. A boolean here
 * would be a screen that says no and nothing else.
 *
 * So each clause comes back as its own flag and the caller branches in a fixed order. The triggers
 * still enforce all of it; this exists so the refusal arrives as a sentence instead of as
 * `publish_denied`, which is what `http.js` would otherwise hand back — every RAISE string in 021
 * is snake_case precisely so none of them ever reaches a person.
 *
 * Binds ONE parameter, the caller's own id, three times. Alias-free: it selects `FROM users u`.
 */
export const PUBLISH_STANDING = `
  SELECT
    u.disabled_at IS NULL                                        AS enabled,
    u.role IN ('coach','admin')                                  AS roleOk,
    u.session_version                                            AS sessionVersion,
    u.created_at <= unixepoch()
      - (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish') AS oldEnough,
    u.created_at
      + (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish') AS eligibleAt,
    EXISTS (SELECT 1 FROM guidelines_acceptances a
              JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
             WHERE a.user_id = u.id)                             AS guidelinesOk,
    (SELECT v.version  FROM guidelines_versions v WHERE v.active = 1) AS activeVersion,
    (SELECT v.i18n_key FROM guidelines_versions v WHERE v.active = 1) AS activeI18nKey,
    EXISTS (SELECT 1 FROM coach_profiles c
             WHERE c.user_id = u.id AND c.removed_at IS NULL)    AS hasProfile,
    EXISTS (SELECT 1 FROM coach_profiles c
             WHERE c.user_id = u.id AND c.removed_at IS NULL
               AND c.published_at IS NOT NULL)                   AS profileLive
  FROM users u WHERE u.id = ?`;

/**
 * The columns a public read may project, written once.
 *
 * WHAT IS ABSENT IS THE CONTROL. No `user_id`, no email, no `id`. A post is addressed by its
 * 12-character `public_id` and a coach by their handle, so an enumerable integer never leaves the
 * server — and an enumerable id plus a public profile endpoint is a directory of every account in
 * the product, which is the defect that killed the 019 marketplace on a narrower surface.
 *
 * `body_src` is absent too: the markdown source is returned ONLY to its author, on the edit form.
 * The public reads the DOC.
 */
export const PUBLIC_POST_COLUMNS = `
  p.public_id AS id, p.kind_key AS kind, p.title, p.body_doc AS doc, p.body_excerpt AS excerpt,
  p.doc_version AS docVersion, p.city_key AS city, p.event_at AS eventAt, p.event_tz AS eventTz,
  p.capacity, p.price_minor AS priceMinor, p.price_currency AS priceCurrency,
  p.published_at AS publishedAt,
  c.handle AS coachHandle, c.display_name AS coachName, c.headline AS coachHeadline,
  CASE WHEN c.verified_at IS NULL THEN 0 ELSE 1 END AS coachVerified`;

export const PUBLIC_PROFILE_COLUMNS = `
  c.handle, c.display_name AS displayName, c.headline, c.bio_doc AS bioDoc,
  c.doc_version AS docVersion, c.city_key AS city,
  CASE WHEN c.verified_at IS NULL THEN 0 ELSE 1 END AS verified,
  c.published_at AS publishedAt`;

/**
 * Sort keys are a CLOSED MAP to fixed fragments. A column name from a query string never reaches
 * SQL — the same rule `exercises/routes.js` follows, and the reason its `SORTS` object exists.
 *
 * `popular` IS DELIBERATELY ABSENT. Reactions were cut, and a follower count was cut with them,
 * precisely because `ORDER BY follower_count DESC` is a ranking purchasable at one free
 * registration per follower. What remains cannot be bought: verified-then-recency.
 */
export const POST_SORTS = {
  recent: 'p.published_at DESC, p.id DESC',
  soonest: 'p.event_at ASC, p.id DESC',
};

/**
 * Directory order, keyed on `listed_at` rather than `published_at`.
 *
 * `published_at` is cleared by unpublish and re-set by publish, so ordering by it made
 * unpublish-then-publish a free jump to the top of the directory, repeatable as fast as the limiter
 * allows — and it moved rows under everyone else's keyset cursor while it happened. `listed_at` is
 * written once, at the first publish, and never cleared: the position a coach earns is the position
 * they keep, and taking your own profile down for a week does not buy you the front page.
 */
export const PROFILE_SORTS = {
  recommended: 'CASE WHEN c.verified_at IS NULL THEN 1 ELSE 0 END, c.listed_at DESC, c.user_id DESC',
  recent: 'c.listed_at DESC, c.user_id DESC',
};

/**
 * The AUTHOR'S view of their own posts, which is not the public one.
 *
 * ═══ THIS MUST NOT COMPOSE PUBLIC_POST ═════════════════════════════════════════════════════════
 *
 * PUBLIC_POST requires published_at IS NOT NULL. Reusing it here would return zero drafts, and an
 * empty draft list looks exactly like a coach who has not written anything — a bug that reports
 * itself as an empty state rather than as an error.
 *
 * Ownership is the whole predicate. Not-yours and never-existed are one answer, so this filter is
 * the only thing between a post and a stranger.
 */
export const AUTHOR_POST_ANY = '(p.author_user_id = ?)';

/**
 * Everything the author may see, including the two things no public read returns: body_src, the
 * markdown they typed, and row_version, which their next edit has to send back.
 *
 * removal_reason is deliberately NOT here. A moderator's note is written for the moderation queue,
 * and handing it back verbatim turns an internal record into a message nobody chose to send.
 */
export const AUTHOR_POST_COLUMNS = `
  p.public_id AS id, p.kind_key AS kind, p.title, p.body_src AS bodySrc, p.body_doc AS doc,
  p.body_excerpt AS excerpt, p.doc_version AS docVersion, p.city_key AS city,
  p.event_at AS eventAt, p.event_tz AS eventTz, p.capacity,
  p.price_minor AS priceMinor, p.price_currency AS priceCurrency,
  p.published_at AS publishedAt, p.deleted_at AS deletedAt, p.removed_at AS removedAt,
  p.row_version AS rowVersion, p.created_at AS createdAt, p.updated_at AS updatedAt`;

/**
 * The manage-screen state filter, as a CLOSED MAP to fixed fragments.
 *
 * A state name from a query string never reaches SQL.  is a state the author can select
 * because it is a state their post can be IN — hiding it would mean a takedown looks like the post
 * evaporated.
 */
export const POST_STATE_FILTERS = {
  all: '1 = 1',
  draft: '(p.published_at IS NULL AND p.deleted_at IS NULL AND p.removed_at IS NULL)',
  live: '(p.published_at IS NOT NULL AND p.deleted_at IS NULL AND p.removed_at IS NULL)',
  withdrawn: '(p.deleted_at IS NOT NULL AND p.removed_at IS NULL)',
  removed: '(p.removed_at IS NOT NULL)',
};
