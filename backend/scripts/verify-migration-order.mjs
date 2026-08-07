/**
 * verify-migration-order — a migration added BELOW the high-water mark must still apply.
 *
 * ═══ THE DEFECT THIS GUARDS, WHICH WAS REAL AND WAS MINE ═══════════════════════════════════════
 *
 * The runner used to gate on `PRAGMA user_version` alone: `if (version <= current) continue`. One
 * number cannot tell "already applied" apart from "numbered below something that was.
 *
 * Phase 5's adversarial review cut the coach marketplace and RESERVED migration 020 for it, and
 * Phase 6 was to ship 021. The moment 021 committed, a 020 written afterwards would have been
 * `20 <= 21` and skipped FOREVER — no error, no log line, no failure until the first query hit a
 * table that never existed. Reserving the number armed the trap.
 *
 * ═══ IT EXERCISES THE REAL RUNNER, NOT A COPY ══════════════════════════════════════════════════
 *
 * `verify-019` was allowed to carry its own copy of an INSERT, and when the production version of
 * that INSERT turned out to be broken the copy was fixed and the original was not — so the probe
 * went green over a path that aborted every time. This file imports `migrate` from the worker and
 * runs it against a throwaway database, so there is nothing here that can be right while the
 * product is wrong.
 *
 * Run: npm run verify:migrations
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const tmp = path.join(os.tmpdir(), `tracker-migorder-${process.pid}.db`);

// The worker reads DB_PATH at first use, so pointing it at a throwaway file BEFORE importing is
// what keeps this off the real database. The key material is whatever .env already holds.
process.env.DB_PATH = tmp;

const { migrate } = await import('../src/db/worker.js');

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (passed += 1) : (failed += 1);
};

/**
 * A migration file, WITH ITS OWN PRAGMA — which is how every real one in this project ends.
 *
 * That detail is load-bearing and it caught a bug in the very fix this file guards. The runner
 * also sets user_version, so reading the mark AFTER exec reads what the FILE just wrote, not what
 * the database was at. The first version of the MAX guard did exactly that, so a late 020 dragged
 * a schema at 21 back to reporting 20. A helper that emitted no PRAGMA would have passed.
 */
const f = (version, table) => ({
  version,
  sql: `CREATE TABLE ${table} (id INTEGER PRIMARY KEY);
PRAGMA user_version = ${version};`,
});

// ── day one: 019 and 021 exist; 020 has not been written ──────────────────────────────────────
const day1 = migrate({ files: [f(19, 'probe_19'), f(21, 'probe_21')] });
check(
  'a normal run applies every pending file',
  day1.applied.join(',') === '19,21' && day1.version === 21,
  `applied ${day1.applied.join(', ')} → ${day1.version}`,
);

// ── day two: 020 is written and dropped in, where it sorts before 021 ─────────────────────────
const day2 = migrate({ files: [f(19, 'probe_19'), f(20, 'probe_20'), f(21, 'probe_21')] });
check(
  'a file added BELOW the mark is applied, not skipped',
  day2.applied.join(',') === '20',
  `applied ${day2.applied.length ? day2.applied.join(', ') : '(nothing)'}`,
);
check(
  'and it is REPORTED as out of order rather than applied quietly',
  day2.outOfOrder.join(',') === '20',
  `outOfOrder ${JSON.stringify(day2.outOfOrder)}`,
);
check(
  'the mark does not go BACKWARDS when a late file lands',
  day2.version === 21,
  `user_version ${day2.version}`,
);

// ── day three: everything is applied; nothing may run twice ───────────────────────────────────
const day3 = migrate({ files: [f(19, 'probe_19'), f(20, 'probe_20'), f(21, 'probe_21')] });
check(
  'a third run is a no-op — the ledger stops a re-apply',
  day3.applied.length === 0 && day3.outOfOrder.length === 0,
  `applied ${day3.applied.length}, outOfOrder ${day3.outOfOrder.length}`,
);

// ── and the tables really exist ───────────────────────────────────────────────────────────────
const { default: Database } = await import('better-sqlite3-multiple-ciphers');
const { deriveDbKeyHex } = await import('../src/lib/dbkey.js').catch(() => ({ deriveDbKeyHex: null }));
let tables = [];
try {
  const raw = new Database(tmp);
  if (deriveDbKeyHex) {
    raw.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  }
  tables = raw
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'probe_%' ORDER BY name`)
    .all()
    .map((r) => r.name);
  raw.close();
} catch {
  tables = ['(could not reopen — the assertions above already used the same connection)'];
}
check(
  'THE TABLE THE OLD RUNNER WOULD HAVE LOST EXISTS',
  tables.includes('probe_20'),
  tables.join(', '),
);

await fs.rm(tmp, { force: true }).catch(() => {});
await fs.rm(`${tmp}-wal`, { force: true }).catch(() => {});
await fs.rm(`${tmp}-shm`, { force: true }).catch(() => {});

console.log(`\n${failed === 0 ? 'PROBE OK' : 'PROBE FAILED'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
