/**
 * verify-019 — attack the coin schema BEFORE a single route is written on top of it.
 *
 * This is the money migration. Three independent designs were produced, five adversarial lenses
 * attacked all three, and 75 defects came back — one fatal, twenty severe, and thirteen that
 * could not have been fixed later because SQLite cannot alter a CHECK or an FK. Migration 019 is
 * what survived that.
 *
 * A design that survived a review on paper has survived nothing. Every guard below gets an attempt
 * that MUST be refused, and every derived value gets a scenario where it would drift if the
 * mechanism were absent.
 *
 * It runs on a THROWAWAY copy built from the migration files, like verify-schema, so it can be
 * run against a live database without touching a row of real data — and so that removing a
 * migration file is enough to watch the assertions fail.
 *
 * Run: npm run verify:019
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3-multiple-ciphers';

const MIGRATIONS = path.resolve('src/db/migrations');
const tmp = path.join(os.tmpdir(), `tracker-verify-019-${process.pid}.db`);
const db = new Database(tmp);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

for (const f of (await fs.readdir(MIGRATIONS)).filter((n) => /^\d+_.*\.sql$/.test(n)).sort()) {
  db.exec(await fs.readFile(path.join(MIGRATIONS, f), 'utf8'));
}

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (passed += 1) : (failed += 1);
};

/** An attempt that MUST be refused. Succeeding is the failure. */
const refused = (label, fn, expect) => {
  try {
    fn();
    check(label, false, 'THE WRITE WAS ACCEPTED');
  } catch (e) {
    const msg = String(e.message);
    check(label, !expect || msg.includes(expect), msg.slice(0, 88));
  }
};

const run = (sql, ...p) => db.prepare(sql).run(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);

/* ── fixtures ───────────────────────────────────────────────────────────────────────────────── */

const mkUser = (label, role = 'user') => {
  run(`INSERT INTO users (email, password_hash, role) VALUES (?, 'x', ?)`, `${label}@probe.test`, role);
  return one(`SELECT id FROM users WHERE email = ?`, `${label}@probe.test`).id;
};

const alice = mkUser('alice');
const bob = mkUser('bob');
const admin = mkUser('admin', 'admin');

const aurora = one(`SELECT id, price_minor, entitlement_key, sku FROM coin_store_items WHERE sku = 'theme.aurora'`);
const ember = one(`SELECT id, price_minor, entitlement_key, sku FROM coin_store_items WHERE sku = 'theme.ember'`);

/** The whole legitimate credit path, exactly as a worker transaction would do it. */
const credit = (userId, amount, key, reason = 'admin.credit') =>
  run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, idempotency_key,
                              actor_user_id, request_id, note)
          VALUES (?, ?, ?, ?, ?, 'probe-req', NULL)`,
    userId,
    amount,
    reason,
    key,
    admin,
  );

const balanceOf = (u) => one(`SELECT balance_minor FROM coin_wallets WHERE user_id = ?`, u).balance_minor;
const sumOf = (u) =>
  one(`SELECT COALESCE(SUM(amount_minor), 0) AS s FROM coin_ledger WHERE user_id = ?`, u).s;

console.log('\n── THE WALLET OPENS, AND IT OPENS EMPTY ─────────────────────────────────────────');

check(
  'creating a user opens a wallet',
  one(`SELECT COUNT(*) AS n FROM coin_wallets WHERE user_id = ?`, alice).n === 1,
);
check('and it opens at zero', balanceOf(alice) === 0);

refused(
  'a wallet cannot be opened with money in it',
  () => run(`INSERT INTO coin_wallets (user_id, balance_minor) VALUES (?, 5000)`, mkUser('minter')),
  'a wallet opens empty',
);

refused(
  'a ledger row for an account with no wallet is refused',
  () => {
    run(`DELETE FROM coin_wallets WHERE user_id = ?`, bob);
    credit(bob, 100, 'nowallet1234');
  },
  'there is no wallet',
);
run(`INSERT INTO coin_wallets (user_id) VALUES (?)`, bob);

console.log('\n── THE BALANCE IS DERIVED, AND IT MAY NOT LIE ───────────────────────────────────');

credit(alice, 50000, 'seed-alice-001');
check('a credit moves the balance', balanceOf(alice) === 50000, `${balanceOf(alice)}`);
check('and the cache equals the ledger', balanceOf(alice) === sumOf(alice));

refused(
  'FORGE: writing a balance the ledger does not support is refused',
  () => run(`UPDATE coin_wallets SET balance_minor = 9999999 WHERE user_id = ?`, alice),
  'derived',
);
check(
  'and the forged balance did not stick',
  balanceOf(alice) === 50000 && balanceOf(alice) === sumOf(alice),
  `${balanceOf(alice)} vs SUM ${sumOf(alice)}`,
);

refused(
  'even setting it to zero is refused — the SUM is the only permitted value',
  () => run(`UPDATE coin_wallets SET balance_minor = 0 WHERE user_id = ?`, alice),
  'derived',
);

console.log('\n── A MOVEMENT MUST OBEY ITS REASON ──────────────────────────────────────────────');

refused(
  'FORGE: spending a NEGATIVE amount to mint is refused',
  () => run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id,
                              idempotency_key, request_id)
          VALUES (?, 5000, 'admin.debit', NULL, NULL, 'invert-0001', 'r')`,
    alice,
  ),
  'contradicts the reason',
);

refused(
  'FORGE: crediting with a debit reason is refused',
  () => run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, idempotency_key, request_id)
          VALUES (?, -5000, 'admin.credit', 'invert-0002', 'r')`,
    alice,
  ),
  'contradicts the reason',
);

refused(
  'EXTREMES: a movement above the reason ceiling is refused',
  () => credit(alice, 1000001, 'toobig-00001'),
  'contradicts the reason',
);

// TWO GUARDS CATCH THIS, and the assertion must not pin which. A BEFORE INSERT trigger runs
// before column CHECKs are evaluated, so `trg_coin_ledger_reason_shape` refuses a zero (it is
// neither > 0 nor < 0 for any sign) before `amount_minor <> 0` is ever reached. Asserting the
// CHECK's message specifically would make this test fail the day a trigger is reordered, which
// is a test that breaks on a change that broke nothing.
refused('EXTREMES: a zero movement is refused', () => credit(alice, 0, 'zero-000001'));

refused(
  'FORGE: an achievement reward pointing at nothing is refused',
  () => run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id,
                              idempotency_key, request_id)
          VALUES (?, 2500, 'achievement.reward', NULL, NULL, 'noref-00001', 'r')`,
    alice,
  ),
  undefined,
);

refused(
  'FORGE: an admin credit that invents a ref_type is refused',
  () => run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id,
                              idempotency_key, actor_user_id, request_id)
          VALUES (?, 2500, 'admin.credit', 'user_achievement', 1, 'fakeref-001', ?, 'r')`,
    alice,
    admin,
  ),
  'contradicts the reason',
);

console.log('\n── REPLAY: ONE KEY, AT MOST ONE MOVEMENT ────────────────────────────────────────');

refused(
  'REPLAY: the same key twice on one wallet is refused',
  () => credit(alice, 1000, 'seed-alice-001'),
  'UNIQUE',
);

// The key namespace is PER WALLET, which is what lets two users legitimately hold the same
// client-supplied string.
credit(bob, 1000, 'seed-alice-001');
check(
  'the same key on a DIFFERENT wallet is a different operation',
  balanceOf(bob) === 1000,
  `${balanceOf(bob)}`,
);

console.log('\n── NON-NEGATIVITY, AND WHERE IT LIVES ───────────────────────────────────────────');

refused(
  'RACE BACKSTOP: a debit larger than the balance is refused at the ledger',
  () => run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, idempotency_key,
                              actor_user_id, request_id)
          VALUES (?, -999999, 'admin.debit', 'overdraw-001', ?, 'r')`,
    bob,
    admin,
  ),
  'enough coins',
);
check('and the balance is untouched', balanceOf(bob) === 1000 && sumOf(bob) === 1000);

// THE PLACEMENT TEST. Non-negativity sits on the LEDGER INSERT, not the wallet UPDATE, so that a
// cascade deleting rows in rowid order cannot momentarily recompute negative and abort an account
// deletion. Give a user a credit and then a debit, in that rowid order, and delete them.
const cascader = mkUser('cascader');
credit(cascader, 10000, 'casc-credit-1');
run(
  `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, idempotency_key,
                            actor_user_id, request_id)
        VALUES (?, -9000, 'admin.debit', 'casc-debit-01', ?, 'r')`,
  cascader,
  admin,
);
let cascadeOk = true;
let cascadeMsg = 'deleted';
try {
  run(`DELETE FROM users WHERE id = ?`, cascader);
} catch (e) {
  cascadeOk = false;
  cascadeMsg = e.message.slice(0, 70);
}
check(
  'CASCADE: deleting an account with a credit BEFORE a debit still succeeds',
  cascadeOk,
  cascadeMsg,
);

console.log('\n── HISTORY CANNOT BE REWRITTEN ──────────────────────────────────────────────────');

const row = one(`SELECT id FROM coin_ledger WHERE user_id = ? LIMIT 1`, alice);

refused(
  'a movement amount cannot be edited',
  () => run(`UPDATE coin_ledger SET amount_minor = 999 WHERE id = ?`, row.id),
  'cannot be rewritten',
);
refused(
  'a movement cannot be re-pointed at another wallet',
  () => run(`UPDATE coin_ledger SET user_id = ? WHERE id = ?`, bob, row.id),
  'cannot be rewritten',
);
refused(
  'and its idempotency key cannot be freed up for reuse',
  () => run(`UPDATE coin_ledger SET idempotency_key = 'recycled-01' WHERE id = ?`, row.id),
  'cannot be rewritten',
);

// The ONE permitted update is erasure: the actor becoming anonymous. Proven through the FK.
const erasable = mkUser('erasable', 'admin');
run(
  `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, idempotency_key,
                            actor_user_id, request_id)
        VALUES (?, 500, 'admin.credit', 'erasure-0001', ?, 'r')`,
  alice,
  erasable,
);
let erasureOk = true;
let erasureMsg = 'deleted';
try {
  run(`DELETE FROM users WHERE id = ?`, erasable);
} catch (e) {
  erasureOk = false;
  erasureMsg = e.message.slice(0, 70);
}
const anonymised = one(`SELECT actor_user_id, amount_minor FROM coin_ledger WHERE idempotency_key = 'erasure-0001'`);
check(
  'ERASURE: deleting an admin anonymises their movements rather than blocking',
  erasureOk && anonymised?.actor_user_id === null && anonymised.amount_minor === 500,
  erasureOk ? `actor=${anonymised?.actor_user_id}, amount intact=${anonymised?.amount_minor === 500}` : erasureMsg,
);

console.log('\n── THE STORE: A PRICE IS THE ITEM\'S, NEVER THE BUYER\'S ──────────────────────────');

refused(
  'EXTREMES: a free item cannot be created — it would be permanently unbuyable',
  () => run(
    `INSERT INTO coin_store_items (sku, title, price_minor, entitlement_key)
          VALUES ('x.free', 'Free', 0, 'x.free')`,
  ),
  'CHECK',
);

refused(
  'EXTREMES: an item priced above what a purchase may move is refused',
  () => run(
    `INSERT INTO coin_store_items (sku, title, price_minor, entitlement_key)
          VALUES ('x.huge', 'Huge', 99999999, 'x.huge')`,
  ),
  'higher than a single purchase',
);

refused(
  'an item cannot change what it grants',
  () => run(`UPDATE coin_store_items SET entitlement_key = 'theme.ember' WHERE id = ?`, aurora.id),
  'cannot change what it is',
);

// Repricing IS allowed — that is the point of the frozen trigger being narrow.
run(`UPDATE coin_store_items SET price_minor = 20000 WHERE id = ?`, aurora.id);
check(
  'but it CAN be repriced',
  one(`SELECT price_minor FROM coin_store_items WHERE id = ?`, aurora.id).price_minor === 20000,
);
run(`UPDATE coin_store_items SET price_minor = ? WHERE id = ?`, aurora.price_minor, aurora.id);

console.log('\n── A RECEIPT IS A SNAPSHOT, AND IT MUST BE THE TRUE ONE ─────────────────────────');

const buy = (userId, item, key) => {
  const p = run(
    `INSERT INTO coin_purchases (user_id, item_id, sku_snapshot, title_snapshot,
                                 entitlement_key, price_minor_snapshot, request_id)
     SELECT ?, i.id, i.sku, i.title, i.entitlement_key, i.price_minor, 'probe-req'
       FROM coin_store_items i
      WHERE i.id = ? AND i.active = 1 AND i.delisted_at IS NULL`,
    userId,
    item.id,
  );
  run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id,
                              idempotency_key, request_id)
     SELECT ?, -p.price_minor_snapshot, 'store.purchase', 'coin_purchase', p.id, ?, 'probe-req'
       FROM coin_purchases p WHERE p.id = ?`,
    userId,
    key,
    p.lastInsertRowid,
  );
  run(
    `INSERT INTO coin_entitlements (user_id, item_id, purchase_id, entitlement_key)
     SELECT p.user_id, p.item_id, p.id, p.entitlement_key
       FROM coin_purchases p WHERE p.id = ?`,
    p.lastInsertRowid,
  );
  return p.lastInsertRowid;
};

refused(
  'FORGE: a receipt claiming a price the item does not have is refused',
  () => run(
    `INSERT INTO coin_purchases (user_id, item_id, sku_snapshot, title_snapshot,
                                 entitlement_key, price_minor_snapshot, request_id)
          VALUES (?, ?, ?, 'Aurora', ?, 1, 'r')`,
    alice,
    aurora.id,
    aurora.sku,
    aurora.entitlement_key,
  ),
  'not the ones the item defines',
);

const purchaseId = buy(alice, aurora, 'buy-aurora-1');
check(
  'a legitimate purchase debits exactly the item price',
  balanceOf(alice) === 50000 + 500 - aurora.price_minor,
  `${balanceOf(alice)}`,
);
check('and the cache still equals the ledger', balanceOf(alice) === sumOf(alice));

refused(
  'FORGE: a debit that does not equal its receipt is refused',
  () => run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id,
                              idempotency_key, request_id)
          VALUES (?, -1, 'store.purchase', 'coin_purchase', ?, 'cheap-00001', 'r')`,
    alice,
    purchaseId,
  ),
  'does not match the thing it is paying for',
);

refused(
  'IDOR: a debit on someone ELSE for my receipt is refused',
  () => run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id,
                              idempotency_key, request_id)
          VALUES (?, ?, 'store.purchase', 'coin_purchase', ?, 'idor-000001', 'r')`,
    bob,
    -aurora.price_minor,
    purchaseId,
  ),
  'does not match the thing it is paying for',
);

refused(
  'REPLAY: a SECOND debit for the same receipt is refused even with a fresh key',
  () => run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id,
                              idempotency_key, request_id)
          VALUES (?, ?, 'store.purchase', 'coin_purchase', ?, 'freshkey-001', 'r')`,
    alice,
    -aurora.price_minor,
    purchaseId,
  ),
  'UNIQUE',
);

refused(
  'a receipt cannot be rewritten',
  () => run(`UPDATE coin_purchases SET price_minor_snapshot = 1 WHERE id = ?`, purchaseId),
  'cannot be rewritten',
);

console.log('\n── ENTITLEMENTS: OWNED ONCE, AND ONLY BY WHOEVER PAID ───────────────────────────');

refused(
  'IDOR: granting an entitlement backed by another user\'s receipt is refused',
  () => run(
    `INSERT INTO coin_entitlements (user_id, item_id, purchase_id, entitlement_key)
          VALUES (?, ?, ?, ?)`,
    bob,
    aurora.id,
    purchaseId,
    aurora.entitlement_key,
  ),
  'backed by the purchase',
);

refused(
  'REPLAY: owning the same thing twice is refused',
  () => run(
    `INSERT INTO coin_entitlements (user_id, item_id, purchase_id, entitlement_key)
          VALUES (?, ?, ?, ?)`,
    alice,
    aurora.id,
    purchaseId,
    aurora.entitlement_key,
  ),
  'UNIQUE',
);

refused(
  'a grant cannot be re-pointed at another account',
  () => run(`UPDATE coin_entitlements SET user_id = ? WHERE user_id = ?`, bob, alice),
  'never re-pointed',
);

console.log('\n── THE THEME IS GATED BY THE SCHEMA, NOT ONLY BY A ROUTE ────────────────────────');

run(`INSERT INTO user_theme_prefs (user_id, pack) VALUES (?, 'forest')`, bob);
check('a free pack applies to anyone', one(`SELECT pack FROM user_theme_prefs WHERE user_id = ?`, bob).pack === 'forest');

refused(
  'IDOR: applying a premium theme you have not bought is refused',
  () => run(`UPDATE user_theme_prefs SET pack = 'aurora' WHERE user_id = ?`, bob),
  'not unlocked',
);

run(`INSERT INTO user_theme_prefs (user_id, pack) VALUES (?, 'aurora')`, alice);
check(
  'and the buyer CAN apply it',
  one(`SELECT pack FROM user_theme_prefs WHERE user_id = ?`, alice).pack === 'aurora',
);

// REVOCATION TAKES THE THEME BACK WITH NO SWEEPER.
run(`UPDATE coin_entitlements SET revoked_at = unixepoch() WHERE user_id = ? AND entitlement_key = ?`, alice, aurora.entitlement_key);
check(
  'revoking the entitlement resets the applied theme on the spot',
  one(`SELECT pack FROM user_theme_prefs WHERE user_id = ?`, alice).pack === 'midnight',
  one(`SELECT pack FROM user_theme_prefs WHERE user_id = ?`, alice).pack,
);
check(
  'and the revocation frees the slot so it can be bought again',
  one(
    `SELECT COUNT(*) AS n FROM coin_entitlements WHERE user_id = ? AND entitlement_key = ? AND revoked_at IS NULL`,
    alice,
    aurora.entitlement_key,
  ).n === 0,
);

refused(
  'a revocation cannot be undone',
  () => run(`UPDATE coin_entitlements SET revoked_at = NULL WHERE user_id = ?`, alice),
  'never re-pointed or restored',
);

console.log('\n── ACHIEVEMENTS PAY THROUGH THE LEDGER, OR NOT AT ALL ───────────────────────────');

/**
 * THIS HELPER IS A COPY OF THE UNLOCK PATH, AND THAT COST SOMETHING.
 *
 * It reproduces what `unlockAchievementTx` does so the schema can be attacked without a running
 * server — which is the right trade for a SCHEMA probe. But when the real transaction turned out
 * to build a five-character idempotency key against an eight-character floor, this copy was
 * corrected and the transaction was not, so the probe went green over a production path that
 * aborted on every single unlock.
 *
 * An audit must not carry its own copy of what it audits. Where it must, the copy has to be
 * WRONG-PROOF: the padding below is written exactly as the worker writes it, and the smoke suite
 * exercises the real transaction end to end so this file is not the only thing watching it.
 */
const unlock = (userId, key) => {
  const r = run(
    `INSERT INTO user_achievements (user_id, achievement_key, reward_minor_snapshot)
     SELECT ?, a.key, a.reward_minor FROM achievements a WHERE a.key = ? AND a.active = 1`,
    userId,
    key,
  );
  run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id,
                              idempotency_key, request_id)
     SELECT ua.user_id, ua.reward_minor_snapshot, 'achievement.reward', 'user_achievement',
            ua.id, 'ach:' || printf('%010d', ua.id), 'probe-req'
       FROM user_achievements ua WHERE ua.id = ? AND ua.reward_minor_snapshot > 0`,
    r.lastInsertRowid,
  );
  return r.lastInsertRowid;
};

const before = balanceOf(bob);
unlock(bob, 'workout.first');
check(
  'an unlock pays its catalogue reward',
  balanceOf(bob) === before + 2500,
  `${before} -> ${balanceOf(bob)}`,
);

refused(
  'FORGE: an unlock that pays more than its achievement is refused',
  () => run(
    `INSERT INTO user_achievements (user_id, achievement_key, reward_minor_snapshot)
          VALUES (?, 'pr.first', 999999)`,
    bob,
  ),
  'does not pay what its achievement pays',
);

refused(
  'REPLAY: the same achievement twice is refused',
  () => unlock(bob, 'workout.first'),
  'UNIQUE',
);

refused(
  'an unlock cannot be edited afterwards',
  () => run(`UPDATE user_achievements SET reward_minor_snapshot = 1 WHERE user_id = ?`, bob),
  'cannot be edited',
);

console.log('\n── AUDIT COMPLETENESS FOR COIN EVENTS ───────────────────────────────────────────');

refused(
  'a coin admin event with no actor is refused',
  () => run(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, request_id)
          VALUES (NULL, 'coin.admin.adjust', 'user', ?, 'r-1')`,
    alice,
  ),
  'who did it',
);

refused(
  'a coin event with no request id is refused',
  () => run(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, request_id)
          VALUES (?, 'coin.admin.adjust', 'user', ?, NULL)`,
    admin,
    alice,
  ),
  'which request it came from',
);

run(
  `INSERT INTO audit_log (actor_id, action, target_type, target_id, request_id)
        VALUES (?, 'coin.admin.adjust', 'user', ?, 'r-1')`,
  admin,
  alice,
);
check('a complete one is accepted', one(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'coin.admin.adjust'`).n === 1);

// A NON-coin action is untouched by the new trigger — the guard must not have widened.
run(`INSERT INTO audit_log (actor_id, action) VALUES (NULL, 'system.boot')`);
check('and a non-coin event is not made stricter by it', one(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'system.boot'`).n === 1);

console.log('\n── THE THEME REBUILD PRESERVED EVERY ROW ────────────────────────────────────────');

check(
  'the free packs all survived the rebuild as foreign keys',
  one(`SELECT COUNT(*) AS n FROM theme_packs WHERE entitlement_key IS NULL`).n === 5,
);
check(
  'and the premium ones each have a store item granting exactly their key',
  one(
    `SELECT COUNT(*) AS n FROM theme_packs t
       JOIN coin_store_items i ON i.entitlement_key = t.entitlement_key
      WHERE t.entitlement_key IS NOT NULL`,
  ).n === 2,
);

console.log('\n── AND THE INVARIANT HOLDS ACROSS EVERY ACCOUNT ─────────────────────────────────');

const drift = db
  .prepare(
    `SELECT COUNT(*) AS n FROM coin_wallets w
      WHERE w.balance_minor <> (SELECT COALESCE(SUM(l.amount_minor), 0)
                                  FROM coin_ledger l WHERE l.user_id = w.user_id)`,
  )
  .get();
check('no wallet in the database disagrees with its ledger', drift.n === 0, `${drift.n} drifting`);

const negative = db.prepare(`SELECT COUNT(*) AS n FROM coin_wallets WHERE balance_minor < 0`).get();
check('and no balance is negative', negative.n === 0, `${negative.n} negative`);

db.close();
await fs.rm(tmp, { force: true }).catch(() => {});
await fs.rm(`${tmp}-wal`, { force: true }).catch(() => {});
await fs.rm(`${tmp}-shm`, { force: true }).catch(() => {});

console.log(`\n${failed === 0 ? 'PROBE OK' : 'PROBE FAILED'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
