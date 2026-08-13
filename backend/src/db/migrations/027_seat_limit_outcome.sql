-- 027_seat_limit_outcome.sql — `seat_limit` becomes a redemption outcome.
-- Applies on top of user_version 26.
--
-- ═══ WHY THE CONSTRAINT HAD TO MOVE AND NOT JUST THE CODE ══════════════════════════════════════
--
-- `invite_redemptions.outcome` is CHECKd against five values. The seat cap adds a sixth refusal —
-- a code that is perfectly valid, from a coach who has no seat left — and without widening the
-- CHECK the refusal would abort the transaction that was trying to RECORD it. The redemption
-- record is the point of that table: a refused attempt is exactly what it exists to remember.
--
-- ═══ AND WHY IT IS RECORDED RATHER THAN SILENTLY REFUSED ═══════════════════════════════════════
--
-- A client redeems a code, is told no, and nothing anywhere says why. The coach never learns that
-- somebody tried and bounced off their plan limit — which is the single most useful thing the
-- product could tell a coach who is about to upgrade. So `seat_limit` is a first-class outcome and
-- not an error swallowed at the edge.
--
-- SQLite cannot ALTER a CHECK, so this is the twelve-step table rebuild the documentation
-- prescribes. `PRAGMA foreign_keys` is deliberately NOT touched here: the migration runner already
-- wraps this in a transaction, and toggling the pragma inside one is a no-op that reads as
-- protection.

CREATE TABLE invite_redemptions_new (
  id          INTEGER PRIMARY KEY,
  code_id     INTEGER REFERENCES invite_codes(id) ON DELETE SET NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  outcome     TEXT NOT NULL CHECK (outcome IN ('accepted', 'expired', 'exhausted', 'revoked', 'unknown', 'seat_limit')),
  ip          TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO invite_redemptions_new (id, code_id, user_id, outcome, ip, created_at)
  SELECT id, code_id, user_id, outcome, ip, created_at FROM invite_redemptions;

DROP TABLE invite_redemptions;
ALTER TABLE invite_redemptions_new RENAME TO invite_redemptions;

-- The indexes the old table carried. Rebuilt rather than assumed: a table rebuild drops them, and
-- an index that quietly fails to come back is a full scan nobody notices until the table is large.
CREATE INDEX invite_redemptions_code_idx ON invite_redemptions (code_id, created_at DESC);
CREATE INDEX invite_redemptions_user_idx ON invite_redemptions (user_id, created_at DESC);

PRAGMA user_version = 27;
