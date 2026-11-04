// scripts/verify-admin-accounts.mjs — proves the account-admin smoke section can FAIL.
//
// A test that has never been red proves nothing: it may be asserting on a response the planted
// defect leaves untouched, or on nothing at all. So for each defect below this copies the backend
// source into a scratch directory, plants ONE defect in the copy, boots that copy as the server
// (scripts/smoke-run.mjs with SMOKE_SERVER), runs ONLY the section scripts/smoke/admin-accounts.js
// against it (SMOKE_ONLY=admin-accounts) and demands that
//
//   * the run FAILS, and
//   * the particular check named in `expect` is among the failures, and
//   * the server was alive for the rest of the section (many other checks still passed) - a defect
//     that merely crashes the server on boot is not a proof about the check.
//
// The unmodified section is the baseline: `node scripts/smoke-run.mjs` with SMOKE_ONLY=admin-accounts,
// or the full `npm run smoke` (the section runs after the LifeOS sections).
//
// Run:  node scripts/verify-admin-accounts.mjs [--only N] [--list]
//   env: the throwaway server env the smoke runner needs (DB_MASTER_KEY, DB_KEY_SALT, JWT_SECRET,
//        JWT_KID); SMOKE_PORT pins the port.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const BACKEND = path.resolve(import.meta.dirname, '..');
const SCRATCH = path.join(BACKEND, '.mutant-admin-accounts');

/** Cut one `export function name` out of a source text (to the next `export function` or the end). */
function inFunction(src, name, edit) {
  const start = src.indexOf(`export function ${name}`);
  if (start === -1) throw new Error(`anchor gone: export function ${name}`);
  const next = src.indexOf('\nexport function ', start + 10);
  const end = next === -1 ? src.length : next;
  return src.slice(0, start) + edit(src.slice(start, end)) + src.slice(end);
}

/** Replace `from` with `to`, exactly `count` times, or throw: a rotted anchor must not pass silently. */
const swap = (from, to, count = 1) => (src) => {
  const n = src.split(from).length - 1;
  if (n !== count) throw new Error(`anchor found ${n}x, expected ${count}: ${from.slice(0, 80)}`);
  return src.split(from).join(to);
};

const TX = 'src/db/tx/admin-accounts.js';
const ROUTER = 'src/admin/accounts.js';

const MUTANTS = [
  {
    label: "LIKE wildcards are no longer escaped ('_' and '%' act as wildcards again)",
    file: 'src/lib/like.js',
    edit: swap('export const escapeLike = (v) => v.replace(/[\\\\%_]/g, (c) => `${LIKE_ESCAPE}${c}`);', 'export const escapeLike = (v) => v;'),
    expect: '"_" is a literal',
  },
  {
    // Since B-admin-polish a name with U+202E is ALSO refused by hasInvisible (every format character),
    // so this defect now shows on the account search, the other reader of CONTROLS.
    label: 'the CONTROLS set lets the U+202E bidi override through (names stay refused by hasInvisible; the search does not)',
    file: 'src/lib/display-name.js',
    edit: swap("'\\u202A-\\u202E', // the bidi embeddings and overrides", "'\\u202A-\\u202D', // the bidi embeddings and overrides"),
    expect: 'q: NUL, newline and a bidi override are refused',
  },
  {
    label: 'the admin name route stops using the shared validator (any string goes)',
    file: ROUTER,
    edit: swap('const NameBody = z.object({ displayName: displayNameValue }).strict();', 'const NameBody = z.object({ displayName: z.string().nullable() }).strict();'),
    expect: 'extremes: 120 code points pass and 121 fail',
  },
  {
    label: 'signout-all revokes the refresh tokens but forgets to bump the session version',
    file: TX,
    edit: (src) => inFunction(src, 'adminSignOutAllTx', swap("stmt('UPDATE users SET session_version = session_version + 1 WHERE id = ?').run(targetId);", 'void 0;')),
    expect: 'both access tokens die on the very next request',
  },
  {
    label: 'force-password-change leaves the refresh tokens alive',
    file: TX,
    edit: (src) => inFunction(src, 'adminForcePasswordChangeTx', swap("stmt('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0').run(targetId);", 'void 0;')),
    expect: 'the flag is set, the version bumped, the refresh tokens revoked',
  },
  {
    label: 'the write transactions stop comparing the actor\'s session version',
    file: TX,
    edit: swap("if (!actor || actor.sv !== actorSessionVersion) return { outcome: 'not_an_admin' };", "if (!actor) return { outcome: 'not_an_admin' };", 4),
    expect: 'stale session version (inside the 30 s session cache)',
  },
  {
    label: 'the inspect read forgets to re-check the admin in the database',
    file: ROUTER,
    edit: (src) => {
      const at = src.indexOf("'/admin/users/:id',");
      if (at === -1) throw new Error('anchor gone: the inspect route');
      const needle = 'if (!(await assertAdmin(req, res))) return;';
      const i = src.indexOf(needle, at);
      if (i === -1) throw new Error('anchor gone: assertAdmin in the inspect route');
      return src.slice(0, i) + 'void 0;' + src.slice(i + needle.length);
    },
    expect: 'demoted (the token says admin, the database says user)',
  },
  {
    label: 'a name set to the same value again is no longer a replay (second audit row)',
    file: TX,
    edit: (src) => inFunction(src, 'adminSetDisplayNameTx', swap('if ((target.displayName ?? null) === (displayName ?? null)) return view(true);', '')),
    expect: 'replay: the same name again is replayed:true',
  },
  {
    label: 'reset-lockout writes its audit row under the wrong action string',
    file: TX,
    edit: swap("'user.lockout.reset'", "'user.lockout.resetx'"),
    expect: 'one audit row (user.lockout.reset)',
  },
  {
    label: 'the keyset cursor carries the wrong value (the created time instead of the sort value)',
    file: ROUTER,
    edit: swap('encodeCursor([sort, dir, last.sortValue, last.id])', 'encodeCursor([sort, dir, last.createdAt, last.id])'),
    expect: 'a keyset walk returns all 30',
  },
  {
    label: 'the list total ignores the filters',
    file: TX,
    edit: swap('stmt(`SELECT COUNT(*) AS total FROM users u WHERE ${LIST_FILTER}`).get(...filterParams)', 'stmt(`SELECT COUNT(*) AS total FROM users u`).get()'),
    expect: 'a filter with no match is an empty page, total 0',
  },
  {
    label: 'the inspect read leaks session internals',
    file: TX,
    edit: swap('isSelf: u.id === actorId,', "isSelf: u.id === actorId, session_version: 1, tokenHash: 'x',"),
    expect: 'holds no hash, token, session version or provider id',
  },
  {
    label: 'the inspect read returns the processor ids of the subscription',
    file: TX,
    edit: swap('`SELECT s.tier_key AS tierKey, t.name AS tierName, s.status, s.current_period_end AS currentPeriodEnd', '`SELECT s.tier_key AS tierKey, t.name AS tierName, s.status, s.provider_customer_id AS customer, s.current_period_end AS currentPeriodEnd'),
    expect: 'subscription: tier, status and period end',
  },
  {
    label: 'the coin adjustment no longer refuses the admin\'s own account',
    file: 'src/db/worker.js',
    edit: swap("if (actorUserId === targetUserId) return { outcome: 'self' };", ''),
    expect: 'adjusting their OWN coins is refused',
  },
  {
    label: 'enable does not insist on a reason at the edge',
    file: 'src/admin/routes.js',
    edit: swap('const EnableBody = z.object({ reason: reasonText(2000), password: z.string().min(1).max(200).optional() }).strict();', 'const EnableBody = z.object({ reason: reasonText(2000).optional(), password: z.string().min(1).max(200).optional() }).strict();'),
    expect: 'enable WITHOUT a reason is refused',
  },
  {
    label: 'enable does not insist on a reason in the transaction either',
    file: 'src/db/worker.js',
    edit: swap("if (!reason || reason.trim().length === 0) return { outcome: 'needs_reason' };", "if (disabled && (!reason || reason.trim().length === 0)) return { outcome: 'needs_reason' };"),
    expect: 'enable WITHOUT a reason is refused',
    // paired with the route-level mutant above: this one alone is caught by the zod schema
    alsoEdit: [['src/admin/routes.js', swap('const EnableBody = z.object({ reason: reasonText(2000), password: z.string().min(1).max(200).optional() }).strict();', 'const EnableBody = z.object({ reason: reasonText(2000).optional(), password: z.string().min(1).max(200).optional() }).strict();')]],
  },
];

const args = process.argv.slice(2);
if (args.includes('--list')) {
  MUTANTS.forEach((m, i) => console.log(`${i + 1}. ${m.label}`));
  process.exit(0);
}
const onlyAt = args.indexOf('--only');
const only = onlyAt === -1 ? null : Number(args[onlyAt + 1]);

function plant(m) {
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });
  cpSync(path.join(BACKEND, 'src'), path.join(SCRATCH, 'src'), { recursive: true });
  cpSync(path.join(BACKEND, 'server.js'), path.join(SCRATCH, 'server.js'));
  for (const [file, edit] of [[m.file, m.edit], ...(m.alsoEdit ?? [])]) {
    const target = path.join(SCRATCH, file);
    // CRLF checkouts: normalise the copy so a one-line anchor matches either way
    const src = readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
    writeFileSync(target, edit(src));
  }
}

function runSection() {
  let out = '';
  let status = 1;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const r = spawnSync(process.execPath, ['scripts/smoke-run.mjs'], {
      cwd: BACKEND,
      env: {
        ...process.env,
        SMOKE_ONLY: 'admin-accounts',
        SMOKE_SERVER: path.relative(BACKEND, path.join(SCRATCH, 'server.js')).replace(/\\/g, '/'),
        SMOKE_PORT: process.env.SMOKE_PORT ?? '5216',
      },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 6 * 60 * 1000,
    });
    out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    status = r.status ?? 1;
    // The Windows worker-pool teardown crash (0xC0000005) of a SETUP script is a known intermittent
    // fault of the seed scripts, not of the section: run again.
    if (!out.includes('3221225477')) break;
  }
  return { out, status };
}

let proven = 0;
let broken = 0;
for (const [i, m] of MUTANTS.entries()) {
  if (only !== null && i + 1 !== only) continue;
  process.stdout.write(`\n[${i + 1}/${MUTANTS.length}] ${m.label}\n`);
  try {
    plant(m);
  } catch (err) {
    console.log(`  BROKEN HARNESS: ${err.message}`);
    broken += 1;
    continue;
  }
  const { out, status } = runSection();
  rmSync(SCRATCH, { recursive: true, force: true });
  const fails = out.split('\n').filter((l) => l.startsWith('FAIL '));
  const passes = out.split('\n').filter((l) => l.startsWith('PASS ')).length;
  const caught = fails.some((l) => l.includes(m.expect));
  if (status !== 0 && caught && passes > 100) {
    proven += 1;
    console.log(`  caught: ${fails.length} check(s) red, including "${m.expect}" (${passes} still green)`);
  } else {
    broken += 1;
    console.log(`  NOT PROVEN: exit ${status}, ${fails.length} red, ${passes} green; wanted a FAIL containing "${m.expect}"`);
    for (const l of fails.slice(0, 6)) console.log(`    ${l.slice(0, 160)}`);
    if (!fails.length) console.log(out.split('\n').slice(-12).join('\n'));
  }
}

console.log(`\nverify-admin-accounts: ${proven} planted defect(s) caught, ${broken} not proven`);
process.exit(broken === 0 ? 0 : 1);
