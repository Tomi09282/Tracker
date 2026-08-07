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

export const PROFILE_SORTS = {
  recommended: 'CASE WHEN c.verified_at IS NULL THEN 1 ELSE 0 END, c.published_at DESC, c.user_id DESC',
  recent: 'c.published_at DESC, c.user_id DESC',
};
