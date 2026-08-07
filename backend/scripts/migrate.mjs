// scripts/migrate.mjs — applies pending migrations without booting the HTTP server.
//
// The server migrates on boot, which is right for normal operation but wrong as the ONLY path:
// seeds, maintenance jobs and CI all need the schema without binding a port. Running the seed
// against a stale schema fails with a bare "no such table", which is a confusing way to learn
// that migrations only happen somewhere else.
import 'dotenv/config';
import * as db from '../src/db/index.js';

const result = await db.migrate();
console.log(
  result.applied.length
    ? `migrate: applied ${result.applied.join(', ')} → user_version ${result.version}`
    : `migrate: already at user_version ${result.version}`,
);

// Said here too, because the operator running this by hand is the one who can still do something
// about it. See the header on migrate() in src/db/worker.js for why it is applied rather than
// refused.
if (result.outOfOrder?.length) {
  console.warn(
    `migrate: WARNING — ${result.outOfOrder.join(', ')} ` +
      `${result.outOfOrder.length === 1 ? 'is' : 'are'} numbered below the schema version and ` +
      'applied out of order. Check it was written against this schema, not an older one.',
  );
}
await db.closePool();
