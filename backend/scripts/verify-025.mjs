/**
 * verify-025 — the dashboard's queries, and the indexes they are supposed to use.
 *
 * ═══ AN INDEX THAT STOPS BEING USED IS SILENT ══════════════════════════════════════════════════
 *
 * Migration 025 exists for one reason: every metric in the F8 brief was a full scan, because not
 * one index in the schema led with a time column. That is a claim about QUERY PLANS, and a claim
 * about query plans that nobody checks is a claim that survives its own falsification — the
 * endpoint keeps answering, just slower, and on a dev database with fourteen rows nothing feels
 * wrong. It feels wrong in production, months later, to somebody else.
 *
 * So the plans are asserted. Each case names the index it expects BY NAME: a plan that reaches for
 * a different index is not the plan this migration was written for, and "it used some index" is the
 * kind of loose expectation that made four verify-022 assertions pass for the wrong reason.
 *
 * The queries are the endpoint's own, copied deliberately — this is the one place a second copy is
 * right, because what is being tested is that THESE strings plan well. A probe that built its own
 * simpler query would prove nothing about the route.
 *
 * Run: npm run verify:025
 */
import 'dotenv/config';
import * as db from '../src/db/index.js';

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (passed += 1) : (failed += 1);
};

const plan = async (sql, params = []) =>
  (await db.all(`EXPLAIN QUERY PLAN ${sql}`, params)).map((r) => r.detail).join(' | ');

const DAYS = 30;
const SINCE = `-${DAYS} days`;
const SECS = DAYS * 86400;

const CASES = [
  {
    label: 'the activity union reads both halves from a COVERING index',
    sql: `SELECT d AS day, COUNT(DISTINCT uid) AS people FROM (
            SELECT local_date AS d, client_user_id AS uid FROM workout_logs
             WHERE local_date >= date('now', ?)
            UNION
            SELECT local_date AS d, client_user_id AS uid FROM nutrition_log_items
             WHERE local_date >= date('now', ?)
          )
          GROUP BY d ORDER BY d`,
    params: [SINCE, SINCE],
    // COVERING matters here specifically: the count is over (date, user), which is exactly the
    // index, so the table pages are never touched at all.
    expect: [
      'COVERING INDEX workout_logs_date_idx',
      'COVERING INDEX nutrition_log_items_date_idx',
    ],
  },
  {
    label: 'signups search users_created_idx rather than scanning the user table',
    sql: `SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS n
            FROM users WHERE created_at >= unixepoch() - ? GROUP BY day ORDER BY day`,
    params: [SECS],
    expect: ['INDEX users_created_idx'],
  },
  {
    label: 'completed workouts search workout_logs_date_idx',
    sql: `SELECT local_date AS day, COUNT(*) AS n
            FROM workout_logs WHERE local_date >= date('now', ?) AND status = 'completed'
           GROUP BY day ORDER BY day`,
    params: [SINCE],
    expect: ['INDEX workout_logs_date_idx'],
  },
  {
    label: 'coin velocity searches coin_ledger_created_idx',
    sql: `SELECT date(created_at, 'unixepoch') AS day, SUM(ABS(amount_minor)) AS movedMinor,
                 COUNT(*) AS entries
            FROM coin_ledger WHERE created_at >= unixepoch() - ? GROUP BY day ORDER BY day`,
    params: [SECS],
    expect: ['INDEX coin_ledger_created_idx'],
  },
];

console.log('── the plans ──────────────────────────────────────────────────────────────────');

for (const c of CASES) {
  const detail = await plan(c.sql, c.params);
  const missing = c.expect.filter((e) => !detail.includes(e));
  // A SCAN of any of the four tables is the failure this migration is about, whatever else the
  // plan says. Checked separately so the message names the real problem.
  const scanned = /SCAN (workout_logs|nutrition_log_items|users|coin_ledger)\b/.exec(detail);
  check(
    c.label,
    missing.length === 0 && !scanned,
    scanned ? `FULL SCAN of ${scanned[1]}` : missing.length ? `missing: ${missing.join(', ')}` : detail.slice(0, 76),
  );
}

console.log('\n── and the endpoint still answers with them ───────────────────────────────────');

{
  // The clock labels are not decoration: activity buckets on the user's own day and signups on UTC,
  // and a client that charted them on one axis would be claiming a shared day boundary. If a
  // refactor ever drops the labels, the client has no way to notice.
  const rows = await db.all(
    `SELECT d AS day, COUNT(DISTINCT uid) AS people FROM (
       SELECT local_date AS d, client_user_id AS uid FROM workout_logs WHERE local_date >= date('now', ?)
       UNION
       SELECT local_date AS d, client_user_id AS uid FROM nutrition_log_items WHERE local_date >= date('now', ?)
     ) GROUP BY d ORDER BY d`,
    [SINCE, SINCE],
  );
  check('the activity series returns YYYY-MM-DD days', rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day)), `${rows.length} day(s)`);
  check('and never a day with zero people, because a bucket only exists if somebody was in it', rows.every((r) => r.people > 0));
}

{
  const idx = await db.all(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND name IN
       ('workout_logs_date_idx','nutrition_log_items_date_idx','users_created_idx','coin_ledger_created_idx')`,
  );
  check('all four indexes 025 creates are present', idx.length === 4, idx.map((i) => i.name).join(', '));
}

await db.closePool();
console.log(`\nverify-025: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
