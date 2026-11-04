// src/db/tx/admin-posts.js — the admin side of marketplace posts (package B-admin-posts).
//
// Runs INSIDE a Piscina worker (re-exported by worker.js). Three named functions:
//
//   adminPostListQuery    READ   one snapshot: a page of posts in ANY state plus the filtered total
//   adminPostDetailQuery  READ   one snapshot: the whole inspect page of ONE post
//   restoreRemovedPostTx  WRITE  the only write: lift a moderator's take-down (ONE IMMEDIATE tx)
//
// The take-down itself is NOT here: it is removeSubjectTx in worker.js (POST /admin/marketplace/remove),
// reused as it is. The two meet in the audit log (`marketplace.moderation.remove` / `.restore`).
//
// ═══ A DRAFT IS PRIVATE TO ITS AUTHOR, AND THE ADMIN READ KEEPS IT THAT WAY ═══════════════════════
//
// A post that was never published (published_at IS NULL) is the author's private working copy. The
// admin LIST and the admin DETAIL both show its metadata (title, kind, dates, author, state) because
// a moderator has to be able to see that a thing exists, who owns it and what state it is in. They
// do NOT show its body or its pictures: `body` is null with `bodyWithheld: true`, `media` is empty
// with `mediaWithheld: true`, and the search never looks inside a body (the FTS arm below is
// column-filtered to `title`, so a word that is only in some author's draft finds nothing). The same
// rule holds for a draft that a moderator removed or the author deleted: it was never public, so it
// never becomes readable. A post that WAS published stays readable to the admin in every later state
// (withdrawn, removed), because that content was public and is what a report is about.
import { getDb, stmt, rethrow } from '../conn.js';
import { PUBLIC_POST, POST_STATE_FILTERS } from '../../public/visibility.js';

/** Derived state, in ONE precedence: removed > withdrawn > draft > live. Matches POST_STATE_FILTERS. */
const STATE_CASE = `CASE
    WHEN p.removed_at IS NOT NULL THEN 'removed'
    WHEN p.deleted_at IS NOT NULL THEN 'withdrawn'
    WHEN p.published_at IS NULL   THEN 'draft'
    ELSE 'live' END`;

/**
 * CLOSED MAPS. A sort or state name from a query string selects a fixed fragment; text from the
 * request never becomes SQL.
 */
const SORTS = {
  newest: { order: 'sortAt DESC, rowId DESC', key: '(sortAt, rowId)', cmp: '<', width: 2 },
  oldest: { order: 'sortAt ASC, rowId ASC', key: '(sortAt, rowId)', cmp: '>', width: 2 },
  reports: {
    order: 'openReports DESC, sortAt DESC, rowId DESC',
    key: '(openReports, sortAt, rowId)',
    cmp: '<',
    width: 3,
  },
};

/* ── the list ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * A page of posts, any state, and how many match the filters in total.
 *
 *   state   all | draft | live | withdrawn | removed        (POST_STATE_FILTERS, one definition)
 *   kind    a post_kinds key, or null
 *   like    an ALREADY ESCAPED `%...%` LIKE pattern (ESCAPE '\'), or null          — substring match
 *   fts     toFtsQuery() output, or null                                           — token-prefix match
 *   sort    newest | oldest | reports
 *   cursor  null, or the integer tuple the previous page's last row produced
 *   limit   1..50, enforced by the route and clamped again here
 *
 * ═══ WHY LIKE AND FTS TOGETHER ═════════════════════════════════════════════════════════════════
 *
 * The box says "Cim vagy @szerzo". A moderator types a fragment of a title, of a handle, or of a
 * name, with or without accents. LIKE gives the substring semantics a person expects ("guggol"
 * finds "Guggolas") and is the only thing that can match INSIDE a handle; it is ASCII-case-insensitive
 * in SQLite and accent-sensitive. FTS5 (unicode61 remove_diacritics 2) folds accents and case but
 * matches token PREFIXES only. Either alone misses half of what the box should find, so the title
 * arm is the OR of both; handle and names are LIKE only. The FTS arm is COLUMN-FILTERED to `title`:
 * the index also holds body_src (drafts included) and an unfiltered MATCH would be an oracle for the
 * words of a private draft.
 */
export function adminPostListQuery({
  state = 'all', kind = null, like = null, fts = null, sort = 'newest', cursor = null, limit = 20,
}) {
  const conn = getDb();
  const order = SORTS[sort];
  const stateSql = POST_STATE_FILTERS[state];
  if (!order || !stateSql) throw new Error('admin posts: unknown sort or state');
  const pageSize = Math.min(Math.max(Number.isInteger(limit) ? limit : 20, 1), 50);
  const hasCursor = Array.isArray(cursor) && cursor.length === order.width;

  // The FROM/WHERE shared by the page and the total. Named parameters throughout: the search pattern
  // is used four times and a positional list that repeats it is a list that gets out of step.
  const from = `
      FROM coach_posts p
      JOIN users au ON au.id = p.author_user_id
      LEFT JOIN coach_profiles c ON c.user_id = p.author_user_id
     WHERE ${stateSql}
       AND (@kind IS NULL OR p.kind_key = @kind)
       AND (@like IS NULL OR (
              p.title LIKE @like ESCAPE '\\'
           OR c.handle LIKE @like ESCAPE '\\'
           OR c.display_name LIKE @like ESCAPE '\\'
           OR au.display_name LIKE @like ESCAPE '\\'
           ${fts ? "OR p.id IN (SELECT rowid FROM coach_posts_fts WHERE coach_posts_fts MATCH @fts)" : ''}
       ))`;
  const filterArgs = { kind, like, ...(fts ? { fts: `title : (${fts})` } : {}) };

  const pageSql = `
    SELECT * FROM (
      SELECT p.id AS rowId, p.public_id AS id, p.title, p.kind_key AS kind,
             ${STATE_CASE} AS state,
             p.created_at AS createdAt, p.published_at AS publishedAt,
             p.deleted_at AS withdrawnAt, p.removed_at AS removedAt,
             COALESCE(p.published_at, p.created_at) AS sortAt,
             (SELECT COUNT(*) FROM content_reports r
               WHERE r.subject_post_id = p.id AND r.status_key = 'open') AS openReports,
             au.id AS authorId, c.handle AS authorHandle,
             COALESCE(c.display_name, au.display_name) AS authorName,
             au.role AS authorRole,
             CASE WHEN au.disabled_at IS NULL THEN 0 ELSE 1 END AS authorDisabled,
             CASE WHEN ${PUBLIC_POST} THEN 1 ELSE 0 END AS visible
        ${from}
    )
    WHERE (@useCursor = 0 OR ${order.key} ${order.cmp} (${['@c0', '@c1', '@c2'].slice(0, order.width).join(', ')}))
    ORDER BY ${order.order}
    LIMIT @limit`;

  const pageArgs = {
    ...filterArgs,
    useCursor: hasCursor ? 1 : 0,
    c0: hasCursor ? cursor[0] : 0,
    c1: hasCursor ? cursor[1] : 0,
    ...(order.width === 3 ? { c2: hasCursor ? cursor[2] : 0 } : {}),
    limit: pageSize + 1,
  };

  const read = conn.transaction(() => {
    const rows = stmt(pageSql).all(pageArgs);
    const { total } = stmt(`SELECT COUNT(*) AS total ${from}`).get(filterArgs);
    return { rows, total };
  });
  try {
    const { rows, total } = read.deferred();
    const page = rows.slice(0, pageSize);
    const last = page[page.length - 1];
    const next =
      rows.length > pageSize && last
        ? (sort === 'reports' ? [last.openReports, last.sortAt, last.rowId] : [last.sortAt, last.rowId])
        : null;
    return {
      total,
      posts: page.map(({ rowId, sortAt, ...row }) => ({
        ...row,
        authorDisabled: row.authorDisabled === 1,
        visible: row.visible === 1,
      })),
      next,
    };
  } catch (err) {
    return rethrow(err);
  }
}

/* ── the inspect page ─────────────────────────────────────────────────────────────────────────── */

const parseJson = (text) => {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * ONE post, everything the inspect page draws, in ONE read transaction (so the state, the reports
 * and the timeline of one answer cannot disagree because a take-down committed between two reads).
 *
 * `fullBody: true` adds the rendered document tree (body_doc) to `body`; otherwise only the excerpt
 * travels (the excerpt is at most 1024 characters, the tree up to 256 KB).
 *
 * Returns null for an unknown public id (the route answers 404).
 */
export function adminPostDetailQuery({ publicId, fullBody = false }) {
  const conn = getDb();

  const read = conn.transaction(() => {
    const p = stmt(
      `SELECT p.id AS rowId, p.public_id AS id, p.title, p.kind_key AS kind,
              ${STATE_CASE} AS state,
              p.city_key AS cityKey, city.name_native AS cityName,
              p.event_at AS eventAt, p.event_tz AS eventTz, p.capacity,
              p.price_minor AS priceMinor, p.price_currency AS priceCurrency,
              cur.minor_units AS priceMinorUnits,
              p.created_at AS createdAt, p.published_at AS publishedAt, p.deleted_at AS withdrawnAt,
              p.removed_at AS removedAt, p.removal_reason AS removalReason,
              p.row_version AS rowVersion, p.updated_at AS updatedAt,
              p.body_excerpt AS excerpt, p.body_doc AS docJson, p.doc_version AS docVersion,
              CASE WHEN ${PUBLIC_POST} THEN 1 ELSE 0 END AS visible,
              au.id AS authorId, au.role AS authorRole, au.disabled_at AS authorDisabledAt,
              au.display_name AS authorAccountName,
              c.handle AS authorHandle, c.display_name AS authorProfileName,
              c.verified_at AS profileVerifiedAt, c.published_at AS profilePublishedAt,
              c.removed_at AS profileRemovedAt,
              rm.id AS removerId, rm.email AS removerEmail, rm.display_name AS removerName
         FROM coach_posts p
         JOIN users au ON au.id = p.author_user_id
         LEFT JOIN coach_profiles c ON c.user_id = p.author_user_id
         LEFT JOIN public_cities city ON city.key = p.city_key
         LEFT JOIN public_currencies cur ON cur.code = p.price_currency
         LEFT JOIN users rm ON rm.id = p.removed_by
        WHERE p.public_id = ?`,
    ).get(publicId);
    if (!p) return null;

    // THE DRAFT RULE (file header): a never-published post has no readable body and no pictures.
    const everPublished = p.publishedAt !== null;

    const media = everPublished
      ? stmt(
          `SELECT m.role_key AS role, m.storage_key AS key, m.thumb_key AS thumbKey,
                  m.width, m.height, m.alt
             FROM post_media m
            WHERE m.post_id = ? AND m.deleted_at IS NULL
            ORDER BY CASE m.role_key WHEN 'cover' THEN 0 ELSE 1 END, m.sort_order, m.id`,
        ).all(p.rowId)
      : [];

    // NEVER reporter_user_id: a moderator judges the content, not who objected. Open reports first.
    const reports = stmt(
      `SELECT r.id, r.reason_key AS reason, rr.severity_rank AS severity,
              r.note, r.body_snapshot AS snapshot, r.snapshot_truncated AS snapshotTruncated,
              r.status_key AS status, s.is_terminal AS closed,
              r.created_at AS createdAt, r.resolved_at AS resolvedAt, r.resolution_note AS resolutionNote
         FROM content_reports r
         JOIN report_reasons rr ON rr.key = r.reason_key
         JOIN report_statuses s ON s.key = r.status_key
        WHERE r.subject_post_id = ?
        ORDER BY s.is_terminal ASC, r.created_at DESC, r.id DESC
        LIMIT 30`,
    ).all(p.rowId);
    const counts = stmt(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN r.status_key = 'open' THEN 1 ELSE 0 END) AS open,
              COUNT(DISTINCT r.reporter_user_id) AS distinctReporters
         FROM content_reports r WHERE r.subject_post_id = ?`,
    ).get(p.rowId);

    // The moderation history: every take-down, restore and report resolution of THIS post. A restore
    // clears removed_at, so the row alone cannot say "this was removed twice"; the audit log can.
    const log = stmt(
      `SELECT a.id, a.action, a.created_at AS at, a.actor_id AS actorId,
              u.email AS actorEmail, u.display_name AS actorName, a.detail
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.target_type = 'coach_post' AND a.target_id = ?
          AND a.action GLOB 'marketplace.moderation.*'
        ORDER BY a.id DESC
        LIMIT 50`,
    ).all(p.rowId);

    return { p, everPublished, media, reports, counts, log };
  });

  try {
    const got = read.deferred();
    if (!got) return null;
    const { p, everPublished, media, reports, counts, log } = got;

    const authorDisabled = p.authorDisabledAt !== null;
    const authorIsCoach = p.authorRole === 'coach' || p.authorRole === 'admin';
    // WHY a post is not on the open internet right now, as machine-readable reasons (empty = visible).
    const hiddenBy = [];
    if (p.state === 'draft') hiddenBy.push('draft');
    if (p.state === 'withdrawn') hiddenBy.push('withdrawn');
    if (p.state === 'removed') hiddenBy.push('removed');
    if (authorDisabled) hiddenBy.push('author_disabled');
    if (!authorIsCoach) hiddenBy.push('author_not_coach');
    if (p.authorHandle === null || p.profilePublishedAt === null) hiddenBy.push('profile_unpublished');
    if (p.profileRemovedAt !== null) hiddenBy.push('profile_removed');

    const person = (id, email, name) => (id === null || id === undefined ? null : { id, email, displayName: name });

    const timeline = [{ kind: 'created', at: p.createdAt }];
    if (p.publishedAt !== null) timeline.push({ kind: 'published', at: p.publishedAt });
    if (p.withdrawnAt !== null) timeline.push({ kind: 'withdrawn', at: p.withdrawnAt });
    if (p.removedAt !== null) {
      timeline.push({
        kind: 'removed',
        at: p.removedAt,
        by: person(p.removerId, p.removerEmail, p.removerName),
        reason: p.removalReason,
      });
    }
    timeline.sort((a, b) => a.at - b.at);

    const moderationLog = log.map((row) => {
      const d = parseJson(row.detail) ?? {};
      const action = String(row.action).replace('marketplace.moderation.', '');
      return {
        action,
        at: row.at,
        by: person(row.actorId, row.actorEmail, row.actorName),
        // remove: removalReason · restore: note · resolve: the report decision (and the removal reason)
        reason: d.removalReason ?? null,
        note: d.note ?? null,
        reportId: d.reportId ?? null,
        reportStatus: d.statusKey ?? null,
        removed: typeof d.removed === 'boolean' ? d.removed : action === 'remove',
      };
    });

    return {
      post: {
        id: p.id,
        title: p.title,
        kind: p.kind,
        state: p.state,
        city: p.cityKey === null ? null : { key: p.cityKey, name: p.cityName },
        // Kind-specific fields: event time (+ zone) and capacity for events, price for display only.
        eventAt: p.eventAt,
        eventTz: p.eventTz,
        capacity: p.capacity,
        price:
          p.priceMinor === null
            ? null
            : { minor: p.priceMinor, currency: p.priceCurrency, minorUnits: p.priceMinorUnits },
        createdAt: p.createdAt,
        publishedAt: p.publishedAt,
        withdrawnAt: p.withdrawnAt,
        removedAt: p.removedAt,
        removal: p.removedAt === null ? null : {
          at: p.removedAt,
          by: person(p.removerId, p.removerEmail, p.removerName),
          reason: p.removalReason,
        },
        updatedAt: p.updatedAt,
        rowVersion: p.rowVersion,
        // THE DRAFT RULE, stated in the answer so a client never has to guess why there is no text.
        bodyWithheld: !everPublished,
        body: everPublished
          ? {
              excerpt: p.excerpt,
              docVersion: p.docVersion,
              doc: fullBody ? parseJson(p.docJson) : null,
            }
          : null,
        mediaWithheld: !everPublished,
        media,
        publicVisibility: { visible: p.visible === 1, hiddenBy },
      },
      author: {
        id: p.authorId,
        handle: p.authorHandle,
        displayName: p.authorProfileName ?? p.authorAccountName,
        role: p.authorRole,
        disabled: authorDisabled,
        disabledAt: p.authorDisabledAt,
        profile: p.authorHandle === null
          ? null
          : {
              published: p.profilePublishedAt !== null,
              removed: p.profileRemovedAt !== null,
              verified: p.profileVerifiedAt !== null,
            },
      },
      timeline,
      moderationLog,
      reports: {
        total: counts.total,
        open: counts.open ?? 0,
        distinctReporters: counts.distinctReporters,
        items: reports.map((r) => ({ ...r, closed: r.closed === 1, snapshotTruncated: r.snapshotTruncated === 1 })),
      },
    };
  } catch (err) {
    return rethrow(err);
  }
}

/* ── the one write: lift a take-down ──────────────────────────────────────────────────────────── */

/**
 * Restore a post a moderator removed.
 *
 * ═══ NAMED, GUARDED, AUDITED, DB-SIDE ADMIN CHECK ══════════════════════════════════════════════
 *
 * One logical write = ONE worker call = ONE IMMEDIATE transaction (this file's whole job), so:
 *
 *   * the ACTOR is re-read from the database UNDER THE WRITE LOCK (never the token's role);
 *   * the post must currently be removed - else `not_removed` (409): a second restore, or the
 *     loser of a restore/restore or restore/take-down race, is refused and writes NOTHING;
 *   * the guard is also INSIDE the UPDATE (`WHERE removed_at IS NOT NULL`): the `changes === 0`
 *     probe sits on the FIRST write, so a lost race commits nothing, and the audit INSERT below it
 *     never runs for a refusal (an audit row for an event that did not happen is worse than none);
 *   * `removed_at`, `removed_by` and `removal_reason` are cleared in ONE statement (the pair trigger
 *     trg_post_removal_pair_upd accepts "both NULL"; the frozen-while-removed trigger does not
 *     fire because no content column moves), and row_version is bumped so an author's stale edit
 *     form conflicts instead of silently overwriting;
 *   * the audit row `marketplace.moderation.restore` carries request_id + target_type + target_id +
 *     actor, which trg_audit_log_marketplace_complete (021) demands, and records who removed it and
 *     why, because the columns that held that are cleared by this very statement.
 *
 * The audit log is where the history lives: a post can be removed and restored many times.
 */
export function restoreRemovedPostTx({ adminId, publicId, note = null, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the actor';
    const actor = stmt(
      "SELECT 1 AS ok FROM users WHERE id = ? AND role = 'admin' AND disabled_at IS NULL",
    ).get(adminId);
    if (!actor) return { outcome: 'not_an_admin' };

    current = 'SELECT the post';
    const post = stmt(
      `SELECT id, removed_at AS removedAt, removed_by AS removedBy, removal_reason AS removalReason
         FROM coach_posts WHERE public_id = ?`,
    ).get(publicId);
    if (!post) return { outcome: 'missing' };
    if (post.removedAt === null) return { outcome: 'not_removed' };

    // ── the first write: the guard is in the WHERE, a lost race changes 0 rows and commits nothing ─

    current = 'UPDATE the post to restored';
    const lifted = stmt(
      `UPDATE coach_posts
          SET removed_at = NULL, removed_by = NULL, removal_reason = NULL,
              row_version = row_version + 1, updated_at = unixepoch()
        WHERE id = ? AND removed_at IS NOT NULL`,
    ).run(post.id);
    if (lifted.changes === 0) return { outcome: 'not_removed' };

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.moderation.restore', 'coach_post', ?, ?, ?, ?)`,
    ).run(
      adminId,
      post.id,
      JSON.stringify({
        publicId,
        note,
        previousRemovedAt: post.removedAt,
        previousRemovedBy: post.removedBy,
        previousRemovalReason: post.removalReason,
      }),
      requestId,
      ip,
    );

    current = 'SELECT the post back';
    const view = stmt(
      `SELECT p.public_id AS id, ${STATE_CASE} AS state, p.row_version AS rowVersion,
              CASE WHEN ${PUBLIC_POST} THEN 1 ELSE 0 END AS visible
         FROM coach_posts p
         LEFT JOIN coach_profiles c ON c.user_id = p.author_user_id
        WHERE p.id = ?`,
    ).get(post.id);
    return { outcome: 'applied', replayed: false, post: view ? { ...view, visible: view.visible === 1 } : { id: publicId } };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}
