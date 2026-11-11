// scripts/seed-smoke-store.mjs — two probe items in the smoke suite's throwaway store.
//
// Migration 030 retired the only two items the app ever sold (the Aurora and Ember theme packs),
// so a fresh database has an EMPTY store, and the purchase route — a money endpoint with a forge /
// replay / race / IDOR / extremes section in smoke — would have nothing to buy. Dropping that
// section would drop the regression net of a critical endpoint; keeping it on the retired packs is
// impossible by design (030 refuses to relist them).
//
// So the suite gets its own catalogue, the way seed-accounts gives it its own privileged accounts:
// a TEST fixture, written straight into the smoke database (there is no route that creates store
// items, by design), never into dev or production data. Same price as the retired packs (25000
// minor = 250 coins), so the suite's arithmetic is unchanged. Entitlements in a `smoke.` namespace
// that no theme pack and no product feature reads.
//
// Runs only under smoke-run, against DB_PATH in the OS temp directory.
import 'dotenv/config';
import * as db from '../src/db/index.js';

const PROBES = [
  ['smoke.probe-a', 'Probe A', 'smoke.probe-a'],
  ['smoke.probe-b', 'Probe B', 'smoke.probe-b'],
];

for (const [sku, title, entitlementKey] of PROBES) {
  await db.run(
    `INSERT OR IGNORE INTO coin_store_items (sku, title, description, price_minor, entitlement_key)
     VALUES (?, ?, NULL, 25000, ?)`,
    [sku, title, entitlementKey],
  );
}

await db.closePool();
console.log(`seed-smoke-store: ${PROBES.length} probe items`);
