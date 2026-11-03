// src/db/tx/admin-accounts.js — the admin's account list, the account inspect read, and the four
// account writes that did not exist before package B-admin-accounts.
//
// Runs INSIDE a Piscina worker (re-exported by worker.js; every `export function` is a task the
// facade in src/db/index.js may name). The house rules hold here as everywhere in src/db:
//
//   * ONE logical write = ONE worker call = ONE IMMEDIATE transaction (ADR-0005: every check that
//     can produce an error result runs BEFORE the first write; nothing returns conditionally after
//     it - better-sqlite3 commits on return).
//   * The ACTOR is re-read as an enabled admin INSIDE the transaction, never taken from the token.
//     `requireRole('admin')` reads a JWT that can be fifteen minutes stale.
//   * Prepared statements with bound parameters only. The one dynamic fragment (the ORDER BY of the
//     list) is chosen from a fixed map by a key that zod already restricted to its enum.
//   * A write that finds the target already in the requested state is a REPLAY: `replayed: true`,
//     nothing written, ONE audit row for the one effect.
//
// ═══ WHAT THESE READS WILL NOT RETURN ══════════════════════════════════════════════════════════
//
// No password hash, no session version, no token hash, no `provider_*` id of a subscription, no
// content of any kind. The inspect page counts workouts, nutrition entries, measurements and photos
// and NOTHING MORE: admins deliberately cannot read a person's health content (the privacy rule the
// whole admin surface is built around), and a count is the most this file may say about it.
import { getDb, stmt, rethrow } from '../conn.js';
import { foldText } from '../../lib/like.js';
import { MAX_PAGE } from '../../lib/cursor.js';

/* ── the fold function ───────────────────────────────────────────────────────────────────────────
 *
 * SQLite cannot fold "Fehér" and "feher" together on its own, and an admin will type either. The
 * list search and the `name` sort therefore call `fold_text(...)`, a deterministic SQL function
 * registered on THIS worker's connection that runs the same normalizeText the query side runs - so
 * the stored value and the typed value can only match if they were folded identically.
 *
 * Registered lazily, once per connection (a WeakSet, because closeDb() + getDb() makes a new
 * connection and the old registration is gone with the old one). It must exist BEFORE a statement
 * that mentions it is prepared, so every statement below goes through `conn()`.
 */
const withFold = new WeakSet();
function conn() {
  const c = getDb();
  if (!withFold.has(c)) {
    c.function('fold_text', { deterministic: true }, (v) => (typeof v === 'string' ? foldText(v) : ''));
    withFold.add(c);
  }
  return c;
}

const nowSec = () => Math.floor(Date.now() / 1000);

/* ══ the account list ════════════════════════════════════════════════════════════════════════════ */

/**
 * The columns an admin may sort by: a client KEY -> a fixed SQL expression. The client never sends
 * SQL or a column name that reaches a query; a key outside this object is refused here and by zod
 * before it gets here. `kind` is the type the keyset cursor must carry for that key.
 *
 * The two text keys compare their first 80 characters only (substr), so the value a keyset cursor
 * carries is bounded (a cursor stays well inside lib/cursor.js's 512-character limit whatever the
 * name or address); accounts that tie on those 80 characters fall back to the id tiebreak.
 *
 *   name     the display name, or the e-mail for an account without one, folded (accent- and
 *            case-insensitive) - so "Fehér Tamás" sorts under F and the nameless ones fall in by
 *            their address
 *   created  registration time
 *   email    the same expression the unique index is built on
 *   role     the role key (alphabetical: admin, coach, user)
 *   clients  active coach links - the cursor encoder had to learn this one: its value is an integer
 *            COUNT computed per row, so the cursor carries the count and the id as the tiebreak
 */
const USER_SORTS = {
  name: { sql: "substr(fold_text(COALESCE(NULLIF(trim(u.display_name), ''), u.email)), 1, 80)", kind: 'text' },
  created: { sql: 'u.created_at', kind: 'int' },
  email: { sql: 'substr(lower(trim(u.email)), 1, 80)', kind: 'text' },
  role: { sql: 'u.role', kind: 'text' },
  clients: {
    sql: "(SELECT COUNT(*) FROM coach_clients k WHERE k.coach_id = u.id AND k.status = 'active')",
    kind: 'int',
  },
};

/**
 * The WHERE shared by the page and its total, so the '19 fiók' line and the rows can never describe
 * two different sets. Bind order: pattern, pattern, pattern, role, role, state, state, state.
 *
 * `ESCAPE '\'` is written `'\\'` in this template literal. The pattern is built by lib/like.js:
 * folded, then `\`, `%` and `_` escaped, so a search for "50%" or "a_b" matches those characters
 * literally instead of acting as a wildcard.
 */
const LIST_FILTER = `
  (? IS NULL OR fold_text(u.email) LIKE ? ESCAPE '\\' OR fold_text(u.display_name) LIKE ? ESCAPE '\\')
  AND (? IS NULL OR u.role = ?)
  AND (? = 'all'
    OR (? = 'active'   AND u.disabled_at IS NULL)
    OR (? = 'disabled' AND u.disabled_at IS NOT NULL))`;

/**
 * One page of accounts plus the size of the whole filtered set, from ONE read snapshot.
 *
 * `after` is `{ value, id }` of the last row of the previous page, or null. Rows come back with
 * `sortValue` so the route can encode the cursor; the route strips it before answering.
 */
export function adminUsersListQuery({ pattern = null, role = null, state = 'all', sort, desc, after = null, limit }) {
  const order = USER_SORTS[sort];
  if (!Object.hasOwn(USER_SORTS, sort) || !order) throw new Error('adminUsersListQuery: unknown sort key');
  const c = conn();
  const cmp = desc ? '<' : '>';
  const dir = desc ? 'DESC' : 'ASC';
  const take = Math.min(Math.max(1, limit | 0), MAX_PAGE + 1);
  const filterParams = [pattern, pattern, pattern, role, role, state, state, state];

  let current = null;
  const read = c.transaction(() => {
    current = 'SELECT the page';
    // Every fragment interpolated below is a FIXED string chosen by a key from USER_SORTS or by the
    // cmp/dir booleans - never assembled from request text.
    const rows = stmt(
      `SELECT * FROM (
         SELECT u.id, u.email, u.display_name AS displayName, u.role,
                u.created_at AS createdAt, u.disabled_at AS disabledAt,
                u.must_change_credentials AS mustChange,
                EXISTS (SELECT 1 FROM coach_profiles p WHERE p.user_id = u.id) AS hasProfile,
                (SELECT COUNT(*) FROM coach_clients k
                  WHERE k.coach_id = u.id AND k.status = 'active') AS clientCount,
                ${order.sql} AS sortValue
           FROM users u
          WHERE ${LIST_FILTER}
       )
       WHERE (? = 0 OR (sortValue, id) ${cmp} (?, ?))
       ORDER BY sortValue ${dir}, id ${dir}
       LIMIT ?`,
    ).all(...filterParams, after ? 1 : 0, after ? after.value : null, after ? after.id : null, take);

    current = 'COUNT the filtered set';
    const { total } = stmt(`SELECT COUNT(*) AS total FROM users u WHERE ${LIST_FILTER}`).get(...filterParams);
    return { rows, total };
  });

  try {
    return read();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ the inspect page: ONE request, everything ═══════════════════════════════════════════════════ */

const STATUS_ZERO = () => ({ active: 0, invited: 0, archived: 0 });
const byStatus = (rows) => {
  const out = STATUS_ZERO();
  for (const r of rows) if (Object.hasOwn(out, r.status)) out[r.status] = r.n;
  return out;
};

/** The reason an admin typed when disabling, out of the audit row's JSON; null when it is not there. */
function reasonOf(detail) {
  try {
    const r = JSON.parse(detail ?? 'null')?.reason;
    return typeof r === 'string' && r.length > 0 ? r : null;
  } catch {
    return null;
  }
}

/**
 * Everything the account inspect page shows, from one read snapshot - or null for an unknown id.
 *
 * A handful of indexed queries, deliberately in ONE worker call and one deferred read transaction:
 * the page is internally consistent (a coin balance that agrees with its last entries) and costs the
 * admin ONE request against a 300-per-15-minutes read budget.
 *
 * ═══ THE PROJECTION IS AN EXPLICIT COLUMN LIST, EVERY TIME ═════════════════════════════════════
 *
 * `SELECT *` appears nowhere: a column added to `users` tomorrow (a hash, a token) must be opted into
 * this page by name, not leak into it by default.
 */
export function adminAccountDetailQuery({ targetId, actorId }) {
  const c = conn();
  let current = null;
  const read = c.transaction(() => {
    const now = nowSec();

    current = 'SELECT the account';
    const u = stmt(
      `SELECT id, email, display_name AS displayName, role, created_at AS createdAt,
              disabled_at AS disabledAt, must_change_credentials AS mustChange,
              created_by AS createdById, failed_logins AS failedLogins, next_login_at AS nextLoginAt
         FROM users WHERE id = ?`,
    ).get(targetId);
    if (!u) return null;

    current = 'SELECT the creator';
    const createdBy = u.createdById
      ? (stmt('SELECT id, display_name AS displayName, email FROM users WHERE id = ?').get(u.createdById) ?? null)
      : null;

    // Who disabled the account, why, and when: the LATEST user.disable audit row for this target.
    // The reason lives only there (users has no reason column). A row planted without an audit trail
    // still answers - with a null reason and nobody - rather than hiding that the account is stopped.
    let disabled = null;
    if (u.disabledAt !== null) {
      current = 'SELECT the disable audit row';
      const a = stmt(
        `SELECT a.detail, a.created_at AS at, a.actor_id AS actorId, w.email AS actorEmail,
                w.display_name AS actorName
           FROM audit_log a LEFT JOIN users w ON w.id = a.actor_id
          WHERE a.action = 'user.disable' AND a.target_type = 'user' AND a.target_id = ?
          ORDER BY a.id DESC LIMIT 1`,
      ).get(targetId);
      disabled = {
        at: u.disabledAt,
        reason: a ? reasonOf(a.detail) : null,
        by: a?.actorId ? { id: a.actorId, email: a.actorEmail, displayName: a.actorName } : null,
      };
    }

    // Sessions: families with a live unconsumed token (one login = one family, however often it
    // rotated), and the newest login. Counts and a time - never a token hash, an agent or an address.
    current = 'SELECT the sessions';
    const sessions = stmt(
      `SELECT COUNT(DISTINCT CASE WHEN revoked = 0 AND consumed_at IS NULL AND expires_at > ?
                                  THEN family_id END) AS open,
              MAX(family_created_at) AS lastStartedAt
         FROM refresh_tokens WHERE user_id = ?`,
    ).get(now, targetId);

    // Coaching: links as a coach and as a client by status, the seat cap, the subscription. The cap
    // is resolved exactly like the seat guard does (worker.js hasSeat): an admin is exempt; anyone
    // else resolves through a trialing / active / past_due subscription, else the free tier;
    // client_cap NULL is unlimited.
    current = 'SELECT the coaching links';
    const asCoach = byStatus(
      stmt('SELECT status, COUNT(*) AS n FROM coach_clients WHERE coach_id = ? GROUP BY status').all(targetId),
    );
    const asClient = byStatus(
      stmt('SELECT status, COUNT(*) AS n FROM coach_clients WHERE client_id = ? GROUP BY status').all(targetId),
    );
    current = 'SELECT the seat tier';
    const seat = stmt(
      `SELECT t.key AS tierKey, t.name AS tierName, t.client_cap AS clientCap
         FROM subscription_tiers t
        WHERE t.key = COALESCE(
          (SELECT s.tier_key FROM coach_subscriptions s
            WHERE s.coach_id = ? AND s.status IN ('trialing', 'active', 'past_due')), 'free')`,
    ).get(targetId);
    current = 'SELECT the subscription';
    // NEVER provider_customer_id / provider_subscription_id / provider_event_at: those are the
    // processor's identifiers and nothing on this page needs them.
    const subscription =
      stmt(
        `SELECT s.tier_key AS tierKey, t.name AS tierName, s.status, s.current_period_end AS currentPeriodEnd
           FROM coach_subscriptions s JOIN subscription_tiers t ON t.key = s.tier_key
          WHERE s.coach_id = ?`,
      ).get(targetId) ?? null;

    // The marketplace profile and its posts by state. Precedence: removed (a moderator took it
    // down) > withdrawn (the author took it back) > live (published) > draft.
    current = 'SELECT the marketplace profile';
    const profile = stmt(
      'SELECT handle, published_at AS publishedAt, verified_at AS verifiedAt, removed_at AS removedAt FROM coach_profiles WHERE user_id = ?',
    ).get(targetId);
    let marketplace = null;
    if (profile) {
      current = 'COUNT the posts and the open reports';
      const posts = stmt(
        `SELECT COALESCE(SUM(removed_at IS NULL AND deleted_at IS NULL AND published_at IS NULL), 0) AS draft,
                COALESCE(SUM(removed_at IS NULL AND deleted_at IS NULL AND published_at IS NOT NULL), 0) AS live,
                COALESCE(SUM(removed_at IS NULL AND deleted_at IS NOT NULL), 0) AS withdrawn,
                COALESCE(SUM(removed_at IS NOT NULL), 0) AS removed
           FROM coach_posts WHERE author_user_id = ?`,
      ).get(targetId);
      const { openReports } = stmt(
        `SELECT COUNT(*) AS openReports
           FROM content_reports r JOIN report_statuses s ON s.key = r.status_key
          WHERE r.subject_author_user_id = ? AND s.is_terminal = 0`,
      ).get(targetId);
      marketplace = {
        handle: profile.handle,
        published: profile.publishedAt !== null,
        verified: profile.verifiedAt !== null,
        removed: profile.removedAt !== null,
        posts,
        openReports,
      };
    }

    // Coins: the balance, the last three entries and how many there are (the 'Teljes napló' door
    // opens GET /admin/coins/ledger?user_id=). A note is returned only for an admin's own
    // adjustment - the only rows whose note an admin wrote.
    current = 'SELECT the coins';
    const wallet = stmt('SELECT balance_minor AS balanceMinor FROM coin_wallets WHERE user_id = ?').get(targetId);
    const entries = stmt(
      `SELECT id, amount_minor AS amountMinor, reason_key AS reasonKey,
              CASE WHEN reason_key IN ('admin.credit', 'admin.debit') THEN note END AS note,
              created_at AS createdAt
         FROM coin_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 3`,
    ).all(targetId);
    const { totalEntries } = stmt('SELECT COUNT(*) AS totalEntries FROM coin_ledger WHERE user_id = ?').get(targetId);

    // ═══ ACTIVITY IS FOUR COUNTS AND NOTHING ELSE ══════════════════════════════════════════════
    //
    // PRIVACY RULE: an admin deliberately cannot read a person's health content - not a workout, not
    // a meal, not a measurement, not a photo, not even the date of one. This is the whole of what the
    // inspect page may say about it. Do not add a "last activity" or a list here; the admin routes
    // and the privacy notes (docs/brain/58-Pulse/Screens/admin.md) rest on this.
    current = 'COUNT the activity';
    const { workouts } = stmt(
      "SELECT COUNT(*) AS workouts FROM workout_logs WHERE client_user_id = ? AND status = 'completed'",
    ).get(targetId);
    const { nutritionLogs } = stmt('SELECT COUNT(*) AS nutritionLogs FROM nutrition_log_items WHERE client_user_id = ?').get(targetId);
    const { measurements } = stmt('SELECT COUNT(*) AS measurements FROM body_measurements WHERE client_user_id = ?').get(targetId);
    const { photos } = stmt('SELECT COUNT(*) AS photos FROM progress_photos WHERE client_user_id = ?').get(targetId);

    // The last five audit events whose TARGET is this account. The detail JSON is NOT returned
    // (it can carry a reason or a before/after); the page shows what happened, when, by whom.
    current = 'SELECT the audit events';
    const audit = stmt(
      `SELECT a.id, a.action, a.created_at AS createdAt, a.request_id AS requestId,
              a.actor_id AS actorId, w.email AS actorEmail
         FROM audit_log a LEFT JOIN users w ON w.id = a.actor_id
        WHERE a.target_type = 'user' AND a.target_id = ?
        ORDER BY a.id DESC LIMIT 5`,
    ).all(targetId);

    return {
      account: {
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        createdAt: u.createdAt,
        mustChange: u.mustChange === 1,
        createdBy,
        isSelf: u.id === actorId,
        disabledAt: u.disabledAt,
        disabled,
      },
      sessions: { open: sessions.open, lastStartedAt: sessions.lastStartedAt },
      lockout: {
        failedLogins: u.failedLogins,
        lockedUntil: u.nextLoginAt > now ? u.nextLoginAt : null,
      },
      coaching: {
        asCoach: {
          activeClients: asCoach.active,
          clientCap: u.role === 'admin' ? null : (seat?.clientCap ?? null),
          capExempt: u.role === 'admin',
          tierKey: seat?.tierKey ?? null,
          links: asCoach,
        },
        asClient: { links: asClient },
        subscription,
      },
      marketplace,
      coins: { balanceMinor: wallet?.balanceMinor ?? 0, entries, totalEntries },
      activity: { workouts, nutritionLogs, measurements, photos },
      audit,
    };
  });

  try {
    return read();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ the writes ══════════════════════════════════════════════════════════════════════════════════ */

/** The account as every write answers it. An explicit column list, like everything here. */
const BRIEF_SQL =
  'SELECT id, email, display_name AS displayName, role, disabled_at AS disabledAt, must_change_credentials AS mustChange FROM users WHERE id = ?';
const brief = (id) => {
  const row = stmt(BRIEF_SQL).get(id);
  return row ? { ...row, mustChange: row.mustChange === 1 } : null;
};

/**
 * Set (or clear) somebody's display name.
 *
 * The name was validated by lib/display-name.js - the SAME validator PATCH /auth/me uses. Editing
 * your OWN name here is allowed. The e-mail is the login identity and has no route at all.
 *
 * THE AUDIT ROW CARRIES NO NAME. `audit_log` is append-only and survives the erasure of both the
 * actor and the target (018), so a name written into it would outlive the person's right to be
 * forgotten. It records that a name was set or cleared, and by whom - which is what an audit is for.
 */
export function adminSetDisplayNameTx({ actorId, actorSessionVersion, targetId, displayName, requestId, ip = null }) {
  const c = conn();
  let current = null;

  const tx = c.transaction(() => {
    const view = (replayed) => {
      current = 'SELECT the account back';
      return { outcome: 'applied', replayed, account: brief(targetId) };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────
    current = 'SELECT the actor';
    const actor = stmt("SELECT session_version AS sv FROM users WHERE id = ? AND role = 'admin' AND disabled_at IS NULL").get(actorId);
    // The session version is compared UNCONDITIONALLY (an omitted argument is `undefined !== n`,
    // which refuses): a token minted before the admin's sessions were ended is not an admin here,
    // even inside the 30-second window in which requireAuth still trusts its cached version.
    if (!actor || actor.sv !== actorSessionVersion) return { outcome: 'not_an_admin' };

    current = 'SELECT the target';
    const target = stmt('SELECT id, display_name AS displayName FROM users WHERE id = ?').get(targetId);
    if (!target) return { outcome: 'missing' };

    // The same name again is a replay: nothing written, no second audit row.
    if ((target.displayName ?? null) === (displayName ?? null)) return view(true);

    // ── from here on, nothing may conditionally return ────────────────────────────────────────
    current = 'UPDATE the name';
    stmt('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, targetId);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'user.name.change', 'user', ?, ?, ?, ?)`,
    ).run(
      actorId,
      targetId,
      JSON.stringify({ cleared: displayName === null, hadName: target.displayName !== null }),
      requestId,
      ip,
    );

    return view(false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Clear a login lockout: the per-account backoff counter and its wait.
 *
 * "Locked" means a failure count above zero or a wait that has not run out. Nothing to clear is a
 * replay. Resetting the lockout of a DISABLED account is allowed and harmless: it cannot log in
 * either way, and the frame dims the row rather than the server refusing it.
 */
export function adminResetLockoutTx({ actorId, actorSessionVersion, targetId, requestId, ip = null }) {
  const c = conn();
  let current = null;

  const tx = c.transaction(() => {
    const view = (replayed) => {
      current = 'SELECT the account back';
      return { outcome: 'applied', replayed, account: brief(targetId) };
    };

    current = 'SELECT the actor';
    const actor = stmt("SELECT session_version AS sv FROM users WHERE id = ? AND role = 'admin' AND disabled_at IS NULL").get(actorId);
    // The session version is compared UNCONDITIONALLY (an omitted argument is `undefined !== n`,
    // which refuses): a token minted before the admin's sessions were ended is not an admin here,
    // even inside the 30-second window in which requireAuth still trusts its cached version.
    if (!actor || actor.sv !== actorSessionVersion) return { outcome: 'not_an_admin' };

    current = 'SELECT the target';
    const target = stmt('SELECT id, failed_logins AS failedLogins, next_login_at AS nextLoginAt FROM users WHERE id = ?').get(targetId);
    if (!target) return { outcome: 'missing' };

    const now = nowSec();
    const locked = target.failedLogins > 0 || target.nextLoginAt > now;
    if (!locked) return view(true);

    current = 'UPDATE the lockout';
    stmt('UPDATE users SET failed_logins = 0, next_login_at = 0 WHERE id = ?').run(targetId);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'user.lockout.reset', 'user', ?, ?, ?, ?)`,
    ).run(
      actorId,
      targetId,
      JSON.stringify({ failedLogins: target.failedLogins, wasLockedUntil: target.nextLoginAt > now ? target.nextLoginAt : null }),
      requestId,
      ip,
    );

    return view(false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * End every session of an account: the same two effects as the user's own logout-all - every
 * refresh token revoked, `session_version` bumped so the live access tokens die on their next
 * request - plus an audit row. An account with no open session is a replay.
 *
 * Signing yourself out is allowed (it is your own logout-all); the route clears the cookies then.
 */
export function adminSignOutAllTx({ actorId, actorSessionVersion, targetId, requestId, ip = null }) {
  const c = conn();
  let current = null;

  const tx = c.transaction(() => {
    const view = (replayed, sessions) => {
      current = 'SELECT the account back';
      return { outcome: 'applied', replayed, sessions, account: brief(targetId) };
    };

    current = 'SELECT the actor';
    const actor = stmt("SELECT session_version AS sv FROM users WHERE id = ? AND role = 'admin' AND disabled_at IS NULL").get(actorId);
    // The session version is compared UNCONDITIONALLY (an omitted argument is `undefined !== n`,
    // which refuses): a token minted before the admin's sessions were ended is not an admin here,
    // even inside the 30-second window in which requireAuth still trusts its cached version.
    if (!actor || actor.sv !== actorSessionVersion) return { outcome: 'not_an_admin' };

    current = 'SELECT the target';
    const target = stmt('SELECT id FROM users WHERE id = ?').get(targetId);
    if (!target) return { outcome: 'missing' };

    current = 'COUNT the open sessions';
    const { open } = stmt(
      `SELECT COUNT(DISTINCT family_id) AS open FROM refresh_tokens
        WHERE user_id = ? AND revoked = 0 AND consumed_at IS NULL AND expires_at > ?`,
    ).get(targetId, nowSec());
    if (open === 0) return view(true, 0);

    current = 'UPDATE the refresh tokens';
    stmt('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0').run(targetId);
    current = 'UPDATE the session version';
    stmt('UPDATE users SET session_version = session_version + 1 WHERE id = ?').run(targetId);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'user.sessions.revoke', 'user', ?, ?, ?, ?)`,
    ).run(actorId, targetId, JSON.stringify({ sessions: open }), requestId, ip);

    return view(false, open);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Make the person choose a new password at their next sign-in: `must_change_credentials = 1` (the
 * flow-C gate in requireAuth then lets the account reach nothing but /auth/me, change-credentials
 * and logout), and every session ends now. An account already flagged is a replay.
 */
export function adminForcePasswordChangeTx({ actorId, actorSessionVersion, targetId, requestId, ip = null }) {
  const c = conn();
  let current = null;

  const tx = c.transaction(() => {
    const view = (replayed) => {
      current = 'SELECT the account back';
      return { outcome: 'applied', replayed, account: brief(targetId) };
    };

    current = 'SELECT the actor';
    const actor = stmt("SELECT session_version AS sv FROM users WHERE id = ? AND role = 'admin' AND disabled_at IS NULL").get(actorId);
    // The session version is compared UNCONDITIONALLY (an omitted argument is `undefined !== n`,
    // which refuses): a token minted before the admin's sessions were ended is not an admin here,
    // even inside the 30-second window in which requireAuth still trusts its cached version.
    if (!actor || actor.sv !== actorSessionVersion) return { outcome: 'not_an_admin' };

    current = 'SELECT the target';
    const target = stmt('SELECT id, must_change_credentials AS mustChange FROM users WHERE id = ?').get(targetId);
    if (!target) return { outcome: 'missing' };
    if (target.mustChange === 1) return view(true);

    current = 'UPDATE the account';
    stmt('UPDATE users SET must_change_credentials = 1, session_version = session_version + 1 WHERE id = ?').run(targetId);
    current = 'UPDATE the refresh tokens';
    stmt('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0').run(targetId);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'user.password.force', 'user', ?, ?, ?, ?)`,
    ).run(actorId, targetId, JSON.stringify({}), requestId, ip);

    return view(false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}
