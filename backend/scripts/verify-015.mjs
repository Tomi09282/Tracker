/**
 * verify-015 — attack migration 015 before a single route is written on top of it.
 *
 * The rule this file exists for: **a guard never seen to fire is not a guard.** Every trigger and
 * CHECK in 015 gets an attempt that must be REFUSED, and every snapshot gets a scenario where the
 * pointer it hangs off is destroyed and the value must survive. A probe that only inserts valid
 * rows proves the table accepts data, which was never in doubt.
 *
 * Run: npm run verify:015
 */
import { all, run, closePool } from '../src/db/index.js';

let passed = 0;
let failed = 0;

const ok = (label, cond, detail = '') => {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${label}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}${detail ? `  (${detail})` : ''}`);
  }
};

/** An attempt that MUST be refused. Succeeding is the failure. */
const refused = async (label, fn, expect) => {
  try {
    await fn();
    ok(label, false, 'the write was ACCEPTED');
  } catch (e) {
    const msg = String(e?.message ?? e);
    ok(label, !expect || msg.includes(expect), msg.slice(0, 90));
  }
};

const one = async (sql, params = []) => (await all(sql, params))[0];

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────
const stamp = Date.now();

/*
 * ═══ A REAL argon2id HASH, NOT 'x' ═════════════════════════════════════════════════════════════
 *
 * These accounts never log in — this probe talks to the database, not to HTTP — so a placeholder
 * looked free. It was not: `security-checklist` asks whether EVERY stored hash is argon2id, and a
 * literal 'x' answers no. Two of these fixtures had survived a crashed run (see the cleanup note
 * below) and turned a real security assertion into a false alarm about the product.
 *
 * A fixture that cannot pass the product's own rules is a fixture that will one day be reported as
 * the product failing them. It is a constant rather than a fresh hash per user because hashing at
 * these parameters costs ~50ms and this probe makes three of them; the VALUE is irrelevant, the
 * SHAPE is the point.
 */
const FIXTURE_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$c2VjdXJpdHktY2hlY2tsaXN0LWZpeHR1cmU$JmZgHMlPNVE0kbF3WvjcOKmfaJTFcOyvRakVRVOZfXo';

const mkUser = async (label, role) => {
  const email = `v015-${label}-${stamp}@example.com`;
  await run(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)`, [email, FIXTURE_HASH, role]);
  return (await one(`SELECT id FROM users WHERE email = ?`, [email])).id;
};

/*
 * ═══ SWEEP FIRST, BECAUSE THE CLEANUP AT THE BOTTOM ONLY RUNS WHEN NOTHING GOES WRONG ══════════
 *
 * This script deletes its fixtures on the last line. A run that throws — a real regression, which
 * is the entire point of the probe — never reaches it, so a FAILING run leaves accounts behind and
 * a passing one does not. Exactly backwards.
 *
 * Two of these were found months later by `security-checklist`, still sitting in the dev database.
 * Sweeping at STARTUP is self-healing in a way a `finally` is not: it also collects anything left
 * by a run that was killed, lost its terminal, or crashed the process outright.
 */
await run(`DELETE FROM users WHERE email LIKE 'v015-%@example.com'`);

const coach = await mkUser('coach', 'coach');
const client = await mkUser('client', 'user');
const stranger = await mkUser('stranger', 'user');

await run(
  `INSERT INTO coach_clients (coach_id, client_id, status, origin, invited_at, accepted_at)
        VALUES (?, ?, 'active', 'team_code', unixepoch(), unixepoch())`,
  [coach, client],
);
const link = (await one(`SELECT id FROM coach_clients WHERE coach_id = ? AND client_id = ?`, [coach, client])).id;

const mkFood = async (name, kcalX10, pMg, cMg, fMg) => {
  await run(
    `INSERT INTO foods (source, source_ref, name, normalized_name,
                        kcal_per_100g_x10, protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g)
          VALUES ('usda', ?, ?, ?, ?, ?, ?, ?)`,
    [`${name}-${stamp}`, name, name.toLowerCase(), kcalX10, pMg, cMg, fMg],
  );
  return (await one(`SELECT id FROM foods WHERE source_ref = ?`, [`${name}-${stamp}`])).id;
};

// Chicken breast: 165.0 kcal, 31.0 g protein, 0 g carb, 3.6 g fat per 100 g.
const chicken = await mkFood('Chicken breast', 1650, 31000, 0, 3600);

console.log('\n── FOODS ───────────────────────────────────────────────────────────────────────');

await refused(
  'a manual food with no owner is refused',
  () => run(
    `INSERT INTO foods (source, name, normalized_name, kcal_per_100g_x10,
                        protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g)
          VALUES ('manual', 'Orphan', 'orphan', 100, 0, 0, 0)`,
  ),
  'CHECK',
);

await refused(
  'an imported food with no source_ref is refused',
  () => run(
    `INSERT INTO foods (source, name, normalized_name, kcal_per_100g_x10,
                        protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g)
          VALUES ('usda', 'Anonymous', 'anonymous', 100, 0, 0, 0)`,
  ),
  'CHECK',
);

await refused(
  'the same source_ref twice is refused',
  () => run(
    `INSERT INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
                        protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g)
          VALUES ('usda', ?, 'Dupe', 'dupe', 100, 0, 0, 0)`,
    [`Chicken breast-${stamp}`],
  ),
  'UNIQUE',
);

// NULLs are distinct in a UNIQUE index, and this is load-bearing: without it a user's second
// hand-typed food would collide with their first.
await run(
  `INSERT INTO foods (source, owner_user_id, name, normalized_name, kcal_per_100g_x10,
                      protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g)
        VALUES ('manual', ?, 'Nagyi rakott krumplija', 'nagyi rakott krumplija', 1800, 8000, 15000, 9000)`,
  [client],
);
await run(
  `INSERT INTO foods (source, owner_user_id, name, normalized_name, kcal_per_100g_x10,
                      protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g)
        VALUES ('manual', ?, 'Nagyi masik kajaja', 'nagyi masik kajaja', 1700, 7000, 14000, 8000)`,
  [client],
);
ok(
  'two manual foods by one user coexist (NULL source_ref is distinct)',
  (await one(`SELECT COUNT(*) AS n FROM foods WHERE owner_user_id = ?`, [client])).n === 2,
);

await refused(
  'a food with 900+ kcal per 100 g is refused (nothing is denser than pure fat)',
  () => run(
    `INSERT INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
                        protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g)
          VALUES ('usda', ?, 'Impossible', 'impossible', 99999, 0, 0, 0)`,
    [`imp-${stamp}`],
  ),
  'CHECK',
);

const fts = await all(
  `SELECT f.name FROM foods_fts JOIN foods f ON f.id = foods_fts.rowid
    WHERE foods_fts MATCH ? ORDER BY rank LIMIT 5`,
  ['krumpli*'],
);
ok('FTS finds a manual food', fts.length === 1, fts.map((r) => r.name).join(', '));

// remove_diacritics 2 is why this matters: the user types without accents, the food has them.
await run(
  `INSERT INTO foods (source, owner_user_id, name, normalized_name, kcal_per_100g_x10,
                      protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g)
        VALUES ('manual', ?, 'Túró Rudi', 'turo rudi', 3400, 6000, 40000, 15000)`,
  [client],
);
const accentless = await all(
  `SELECT f.name FROM foods_fts JOIN foods f ON f.id = foods_fts.rowid
    WHERE foods_fts MATCH ? LIMIT 5`,
  ['turo*'],
);
ok('FTS finds "Túró Rudi" when the user types "turo"', accentless.length === 1);

console.log('\n── PLANS: ENTITLEMENT ──────────────────────────────────────────────────────────');

await refused(
  'a client-scope plan with no link is refused',
  () => run(
    `INSERT INTO nutrition_plans (scope, author_user_id, client_user_id, name, normalized_name)
          VALUES ('client', ?, ?, 'Linkless', 'linkless')`,
    [coach, client],
  ),
  'CHECK',
);

await refused(
  'a client-scope plan whose client does not match the link is refused',
  () => run(
    `INSERT INTO nutrition_plans (scope, author_user_id, coach_client_id, client_user_id,
                                  name, normalized_name)
          VALUES ('client', ?, ?, ?, 'Forged', 'forged')`,
    [coach, link, stranger],
  ),
  'must match its coach link',
);

await run(
  `INSERT INTO nutrition_plans (scope, author_user_id, coach_client_id, client_user_id,
                                name, normalized_name, cycle_days, starts_on, status)
        VALUES ('client', ?, ?, ?, 'Cut phase', 'cut phase', 7, date('now'), 'active')`,
  [coach, link, client],
);
const plan = (await one(`SELECT id FROM nutrition_plans WHERE normalized_name = 'cut phase'`)).id;

await refused(
  'repointing a plan at a stranger is refused',
  () => run(`UPDATE nutrition_plans SET client_user_id = ? WHERE id = ?`, [stranger, plan]),
  'must match its coach link',
);

// THE ATTACK HAS TO SATISFY THE CHECK OR IT NEVER REACHES THE TRIGGER.
//
// The first version of this assertion did `SET scope = 'template'` on a client-scope plan and
// reported a failure — because the table CHECK refused it first (a template must have a NULL
// client_user_id), so the trigger never ran and the message did not match. The schema was right
// and the probe was attacking a door that was already bricked up.
//
// The reachable attack is the one that matters anyway: convert a TEMPLATE into a client instance
// IN PLACE, setting the link and the client in the same statement so the CHECK is satisfied. That
// skips the clone, and every client the coach later assigns that template to shares one row —
// editing one client's diet edits everyone's. This is the trigger's actual job.
await run(
  `INSERT INTO nutrition_plans (scope, author_user_id, name, normalized_name)
        VALUES ('template', ?, 'Mould', 'mould')`,
  [coach],
);
const mould = (await one(`SELECT id FROM nutrition_plans WHERE normalized_name = 'mould'`)).id;

await refused(
  'converting a template into a client instance in place is refused',
  () => run(
    `UPDATE nutrition_plans SET scope = 'client', coach_client_id = ?, client_user_id = ?
      WHERE id = ?`,
    [link, client, mould],
  ),
  'scope cannot change',
);
ok(
  'and the template is untouched after the attempt',
  (await one(`SELECT scope, client_user_id FROM nutrition_plans WHERE id = ?`, [mould])).scope === 'template',
);

console.log('\n── DAYS: THE CYCLE IS A BOUNDARY IN BOTH DIRECTIONS ────────────────────────────');

await run(
  `INSERT INTO nutrition_plan_days (plan_id, day_index, name, kcal_target_x10, protein_mg_target)
        VALUES (?, 0, 'Training day', 25000, 180000)`,
  [plan],
);
const day = (await one(`SELECT id FROM nutrition_plan_days WHERE plan_id = ? AND day_index = 0`, [plan])).id;

await refused(
  'a day outside the cycle is refused on insert',
  () => run(`INSERT INTO nutrition_plan_days (plan_id, day_index) VALUES (?, 7)`, [plan]),
  'inside the plan cycle',
);

await run(`INSERT INTO nutrition_plan_days (plan_id, day_index, name) VALUES (?, 6, 'Rest day')`, [plan]);
await refused(
  'shrinking the cycle under an existing day is refused',
  () => run(`UPDATE nutrition_plans SET cycle_days = 5 WHERE id = ?`, [plan]),
  'strand a day',
);

await refused(
  'the same day_index twice is refused',
  () => run(`INSERT INTO nutrition_plan_days (plan_id, day_index) VALUES (?, 0)`, [plan]),
  'UNIQUE',
);

console.log('\n── MEALS AND ITEMS: THE PARENT CHAIN CANNOT BE CROSSED ──────────────────────────');

await run(
  `INSERT INTO meals (plan_id, day_id, position, name, time_hint) VALUES (?, ?, 0, 'Reggeli', '08:00')`,
  [plan, day],
);
const meal = (await one(`SELECT id FROM meals WHERE day_id = ?`, [day])).id;

await run(
  `INSERT INTO nutrition_plans (scope, author_user_id, name, normalized_name)
        VALUES ('template', ?, 'Other', 'other')`,
  [coach],
);
const otherPlan = (await one(`SELECT id FROM nutrition_plans WHERE normalized_name = 'other'`)).id;

await refused(
  "a meal claiming another plan's id is refused",
  () => run(`INSERT INTO meals (plan_id, day_id, position, name) VALUES (?, ?, 1, 'Smuggled')`, [otherPlan, day]),
  'must match its day plan',
);

await refused(
  'a bad time_hint is refused',
  () => run(`INSERT INTO meals (plan_id, day_id, position, name, time_hint) VALUES (?, ?, 1, 'Late', '25:99')`, [plan, day]),
  'CHECK',
);

const addItem = (mealId, planId, foodId, gramsX10) => run(
  `INSERT INTO meal_items (plan_id, meal_id, food_id, position, grams_x10, food_name_snapshot,
                           kcal_per_100g_x10_snapshot, protein_mg_per_100g_snapshot,
                           carb_mg_per_100g_snapshot, fat_mg_per_100g_snapshot)
        SELECT ?, ?, id, 0, ?, name, kcal_per_100g_x10, protein_mg_per_100g,
               carb_mg_per_100g, fat_mg_per_100g
          FROM foods WHERE id = ?`,
  [planId, mealId, gramsX10, foodId],
);

await addItem(meal, plan, chicken, 1500); // 150.0 g

await refused(
  "an item claiming another plan's id is refused",
  () => addItem(meal, otherPlan, chicken, 100),
  'must match its meal plan',
);

await refused(
  'zero grams is refused',
  () => addItem(meal, plan, chicken, 0),
  'CHECK',
);

console.log('\n── THE ARITHMETIC IS EXACT, AND THE SNAPSHOT IS THE VALUE ──────────────────────');

const portion = await one(
  `SELECT kcal_per_100g_x10_snapshot * grams_x10 / 1000   AS kcal_x10,
          protein_mg_per_100g_snapshot * grams_x10 / 1000 AS protein_mg,
          fat_mg_per_100g_snapshot * grams_x10 / 1000     AS fat_mg
     FROM meal_items WHERE meal_id = ?`,
  [meal],
);
ok(
  '150 g of 165.0 kcal/100 g is exactly 247.5 kcal',
  portion.kcal_x10 === 2475,
  `${portion.kcal_x10 / 10} kcal`,
);
ok(
  '150 g of 31 g/100 g protein is exactly 46.5 g',
  portion.protein_mg === 46500,
  `${portion.protein_mg / 1000} g`,
);
ok(
  '150 g of 3.6 g/100 g fat is exactly 5.4 g',
  portion.fat_mg === 5400,
  `${portion.fat_mg / 1000} g`,
);

// THE REASON THE SNAPSHOT EXISTS. Someone corrects the food; what was prescribed must not move.
await run(`UPDATE foods SET kcal_per_100g_x10 = 1900 WHERE id = ?`, [chicken]);
const afterEdit = await one(
  `SELECT kcal_per_100g_x10_snapshot * grams_x10 / 1000 AS kcal_x10 FROM meal_items WHERE meal_id = ?`,
  [meal],
);
ok(
  'correcting the food does NOT rewrite what the coach prescribed',
  afterEdit.kcal_x10 === 2475,
  `still ${afterEdit.kcal_x10 / 10} kcal after the food moved to 190/100 g`,
);

// And the harder half: the food is DELETED.
await run(`DELETE FROM foods WHERE id = ?`, [chicken]);
const afterDelete = await one(
  `SELECT food_id, food_name_snapshot,
          kcal_per_100g_x10_snapshot * grams_x10 / 1000 AS kcal_x10
     FROM meal_items WHERE meal_id = ?`,
  [meal],
);
ok(
  'deleting the food leaves the prescription readable',
  afterDelete !== undefined && afterDelete.food_id === null
    && afterDelete.food_name_snapshot === 'Chicken breast' && afterDelete.kcal_x10 === 2475,
  `food_id=${afterDelete?.food_id}, "${afterDelete?.food_name_snapshot}", ${afterDelete?.kcal_x10 / 10} kcal`,
);

console.log('\n── LOGS: THE CLIENT KEEPS WHAT THEY ATE ────────────────────────────────────────');

const logItem = (uid, date, foodName, kcalX10, gramsX10, planDayId = null) => run(
  `INSERT INTO nutrition_log_items (client_user_id, local_date, tz_name, meal_label, plan_day_id,
                                    grams_x10, food_name_snapshot, kcal_per_100g_x10_snapshot,
                                    protein_mg_per_100g_snapshot, carb_mg_per_100g_snapshot,
                                    fat_mg_per_100g_snapshot)
        VALUES (?, ?, 'Europe/Budapest', 'Reggeli', ?, ?, ?, ?, 20000, 10000, 5000)`,
  [uid, date, planDayId, gramsX10, foodName, kcalX10],
);

await logItem(client, '2026-08-06', 'Oatmeal', 3800, 800, day);
await logItem(client, '2026-08-06', 'Milk', 640, 2500);

const logged = await one(
  `SELECT SUM(kcal_per_100g_x10_snapshot * grams_x10 / 1000) AS kcal_x10
     FROM nutrition_log_items WHERE client_user_id = ? AND local_date = ?`,
  [client, '2026-08-06'],
);
// 80 g of 380 kcal/100 g = 304.0 · 250 g of 64 kcal/100 g = 160.0
ok('a logged day sums exactly', logged.kcal_x10 === 4640, `${logged.kcal_x10 / 10} kcal`);

const target = await one(`SELECT kcal_target_x10 FROM nutrition_plan_days WHERE id = ?`, [day]);
ok(
  'adherence is a comparison the query can make',
  target.kcal_target_x10 === 25000 && logged.kcal_x10 === 4640,
  `${logged.kcal_x10 / 10} logged vs ${target.kcal_target_x10 / 10} target`,
);

await refused(
  'a malformed local_date is refused',
  () => logItem(client, '6 August 2026', 'Nonsense', 100, 100),
  'CHECK',
);

// The whole coaching relationship is destroyed. What they ate is theirs.
await run(`DELETE FROM coach_clients WHERE id = ?`, [link]);
const survived = await one(
  `SELECT COUNT(*) AS n FROM nutrition_log_items WHERE client_user_id = ?`,
  [client],
);
ok(
  'deleting the coach link leaves the client their food log',
  survived.n === 2,
  `${survived.n} items`,
);
const planGone = await one(`SELECT COUNT(*) AS n FROM nutrition_plans WHERE id = ?`, [plan]);
ok(
  'and the PRESCRIPTION dies with the relationship, as 010 decided',
  planGone.n === 0,
  'prescriptions are the coach\'s, history is the client\'s',
);
const dangling = await one(
  `SELECT COUNT(*) AS n FROM nutrition_log_items
    WHERE client_user_id = ? AND plan_day_id IS NOT NULL`,
  [client],
);
ok(
  'the log row that pointed at the dead plan day went NULL rather than away',
  dangling.n === 0
    && (await one(`SELECT COUNT(*) AS n FROM nutrition_log_items WHERE client_user_id = ?`, [client])).n === 2,
);

// ── cleanup ────────────────────────────────────────────────────────────────────────────────────
await run(`DELETE FROM users WHERE email LIKE ?`, [`v015-%-${stamp}@example.com`]);
await run(`DELETE FROM nutrition_plans WHERE normalized_name IN ('other', 'mould')`);
await run(`DELETE FROM foods WHERE source_ref LIKE ?`, [`%-${stamp}`]);

console.log(`\n${failed === 0 ? 'PROBE OK' : 'PROBE FAILED'} — ${passed} passed, ${failed} failed`);
await closePool();
process.exit(failed === 0 ? 0 : 1);
