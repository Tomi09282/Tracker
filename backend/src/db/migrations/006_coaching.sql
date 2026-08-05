-- 006_coaching.sql — coach↔client links, teams, join codes, referrals (F2).

CREATE TABLE IF NOT EXISTS teams (
  id          INTEGER PRIMARY KEY,
  coach_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  archived_at INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS teams_coach_idx ON teams (coach_id, archived_at);

CREATE TRIGGER IF NOT EXISTS teams_updated_at
AFTER UPDATE ON teams FOR EACH ROW
BEGIN
  UPDATE teams SET updated_at = unixepoch() WHERE id = OLD.id;
END;

-- The link, not a column on users: a client may be coached by more than one coach over time, and
-- the relationship carries its own state and history.
CREATE TABLE IF NOT EXISTS coach_clients (
  id         INTEGER PRIMARY KEY,
  coach_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id    INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  status     TEXT NOT NULL DEFAULT 'invited'
             CHECK (status IN ('invited', 'active', 'archived')),
  -- How this link came about, so an audit can tell a self-serve join from a coach-created one.
  origin     TEXT NOT NULL DEFAULT 'invite'
             CHECK (origin IN ('invite', 'team_code', 'pregenerated', 'manual')),
  invited_at INTEGER NOT NULL DEFAULT (unixepoch()),
  accepted_at INTEGER,
  archived_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- One live link per pair. Without this a coach could accumulate duplicate rows for the same
-- client and every "is this mine" check would depend on which row it happened to find.
CREATE UNIQUE INDEX IF NOT EXISTS coach_clients_pair_unique ON coach_clients (coach_id, client_id);
-- The dashboard's main query: my clients, by status.
CREATE INDEX IF NOT EXISTS coach_clients_coach_idx  ON coach_clients (coach_id, status);
-- The reverse direction: which coaches can see this client. Every client-scoped read uses it.
CREATE INDEX IF NOT EXISTS coach_clients_client_idx ON coach_clients (client_id, status);
CREATE INDEX IF NOT EXISTS coach_clients_team_idx   ON coach_clients (team_id, status);

CREATE TRIGGER IF NOT EXISTS coach_clients_updated_at
AFTER UPDATE ON coach_clients FOR EACH ROW
BEGIN
  UPDATE coach_clients SET updated_at = unixepoch() WHERE id = OLD.id;
END;

-- A coach cannot coach themselves — it would make every ownership check ambiguous.
CREATE TRIGGER IF NOT EXISTS coach_clients_no_self
BEFORE INSERT ON coach_clients
WHEN NEW.coach_id = NEW.client_id
BEGIN
  SELECT RAISE(ABORT, 'a coach cannot be their own client');
END;

CREATE TABLE IF NOT EXISTS invite_codes (
  id          INTEGER PRIMARY KEY,
  -- Stored as a SHA-256 hash, never in the clear. The code is shown to the coach exactly once,
  -- at creation; a database leak must not hand an attacker a working way into a team.
  code_hash   TEXT NOT NULL,
  -- A short, non-secret prefix so the coach can recognise which code a row refers to without
  -- the code itself being recoverable.
  label       TEXT,
  coach_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id     INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'multi' CHECK (kind IN ('single', 'multi')),
  max_uses    INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  uses        INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
  expires_at  INTEGER,
  revoked_at  INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS invite_codes_hash_unique ON invite_codes (code_hash);
CREATE INDEX IF NOT EXISTS invite_codes_coach_idx ON invite_codes (coach_id, revoked_at);

-- Every redemption, successful or not, so a brute-force attempt is visible in the data rather
-- than only in a rate-limiter counter that resets.
CREATE TABLE IF NOT EXISTS invite_redemptions (
  id         INTEGER PRIMARY KEY,
  code_id    INTEGER REFERENCES invite_codes(id) ON DELETE SET NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  outcome    TEXT NOT NULL CHECK (outcome IN ('accepted', 'expired', 'exhausted', 'revoked', 'unknown')),
  ip         TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS invite_redemptions_code_idx ON invite_redemptions (code_id, created_at);

CREATE TABLE IF NOT EXISTS referrals (
  id               INTEGER PRIMARY KEY,
  coach_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_id          INTEGER REFERENCES invite_codes(id) ON DELETE SET NULL,
  awarded_at       INTEGER,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS referrals_user_unique ON referrals (referred_user_id);

-- Flow C: an account the coach created keeps a forced-change flag until the client sets their
-- own credentials. Until then the coach knows the password, so the account is not yet the
-- client's — and it must not be usable as if it were.
ALTER TABLE users ADD COLUMN must_change_credentials INTEGER NOT NULL DEFAULT 0
  CHECK (must_change_credentials IN (0, 1));
ALTER TABLE users ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
