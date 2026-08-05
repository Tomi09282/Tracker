-- 001_init.sql — identity, sessions and the audit trail.
--
-- Conventions that hold for every table in this schema (NF3, extensible):
--   * INTEGER PRIMARY KEY id
--   * created_at / updated_at as unix epoch seconds, updated_at maintained by a trigger
--   * enums enforced by CHECK constraints (a lookup table only when admins must edit the set)
--   * every client-owned row carries an owner column with a composite index
--   * junction tables for every m:n relation — never a JSON list of relations
--
-- The file is applied inside ONE transaction together with its user_version bump.

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY,
  email          TEXT    NOT NULL,
  -- Case- and whitespace-insensitive uniqueness lives in the index below, so the original
  -- casing the user typed is preserved for display.
  password_hash  TEXT    NOT NULL,
  role           TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'coach', 'admin')),
  -- Session version. Bumped on role change, password change or forced logout; every access
  -- token carries it, so a stale token is rejected without waiting for its 15-minute expiry.
  session_version INTEGER NOT NULL DEFAULT 1,
  -- Per-account exponential backoff, layered on top of the per-IP limiter: distributed
  -- credential stuffing spreads across IPs but still converges on one account.
  failed_logins  INTEGER NOT NULL DEFAULT 0,
  next_login_at  INTEGER NOT NULL DEFAULT 0,
  disabled_at    INTEGER,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(trim(email)));
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

CREATE TRIGGER IF NOT EXISTS users_updated_at
AFTER UPDATE ON users FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = unixepoch() WHERE id = OLD.id;
END;

-- Refresh tokens are opaque 32-byte random values, stored ONLY as a sha256 hash: a database
-- leak yields no usable session. (sha256 rather than argon2 is correct here — the input is
-- already 256 bits of entropy, so there is nothing for a slow KDF to protect against.)
--
-- `family_id` ties every rotation of one login together. That is what makes reuse detection
-- possible: presenting an already-consumed token means either a benign race or a stolen token,
-- and the family is the blast radius.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash        TEXT    PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id         TEXT    NOT NULL,
  -- Login time, carried on EVERY row of the family rather than derived. Deriving it with
  -- MIN(created_at) would silently reset the absolute cap once the maintenance purge removes
  -- the family's oldest rows — a session could then live forever through rotation.
  family_created_at INTEGER NOT NULL,
  expires_at        INTEGER NOT NULL,
  -- Set when this token is rotated away. A consumed token must never work again.
  consumed_at       INTEGER,
  revoked           INTEGER NOT NULL DEFAULT 0,
  user_agent        TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx   ON refresh_tokens (user_id, revoked);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expiry_idx ON refresh_tokens (expires_at);

-- Append-only. The triggers below make UPDATE and DELETE impossible at the database level, so
-- an audit row cannot be rewritten even by code that has a connection.
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY,
  actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL = the system itself
  action      TEXT    NOT NULL,
  target_type TEXT,
  target_id   INTEGER,
  detail      TEXT,          -- JSON blob: non-relational context only, never a relation
  request_id  TEXT,          -- correlates with the pino request log
  ip          TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS audit_log_actor_idx  ON audit_log (actor_id, created_at);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action, created_at);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
