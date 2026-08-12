// scripts/check-admin-audit.mjs — T7.1.11: an audit_log row for EVERY admin action, no exceptions.
//
// ═══ WHY A GATE AND NOT A HABIT ════════════════════════════════════════════════════════════════
//
// Every admin write in this product currently writes an audit row. That is a fact about today, and
// it was true because whoever wrote each route remembered. The next admin route will be written by
// somebody in a hurry, and the failure is SILENT: an unaudited role change works perfectly. The
// tests pass, the UI updates, the log is simply missing a line nobody will look for until the day
// they need it and it is not there.
//
// An audit you run once is a snapshot; a gate is what keeps being true. So this asserts three
// things about every route that sits behind `requireRole('admin')`:
//
//   1. IT IS AUDITED. A write must reach an `INSERT INTO audit_log` — either inline in the handler,
//      or inside the named worker transaction it delegates to. The gate follows the delegation
//      rather than trusting the handler to look busy.
//
//   2. THE ROLE IS RE-READ FROM THE DATABASE. `requireRole('admin')` reads the JWT, which is a
//      fast-path hint up to fifteen minutes stale. For the operations that reshape the product for
//      everyone, a role revoked thirty seconds ago must not still work. Every admin route must
//      either call `assertAdmin`, read the role itself, or hand the decision to a transaction that
//      refuses a non-admin actor UNDER THE WRITE LOCK.
//
//   3. THE AUDIT ROW SAYS WHICH ROUTE MADE IT. Two admin writes sharing one `action` string leave a
//      log where the rows can be counted but not attributed, which is most of the value gone.
//
// The gate reads routes through scripts/lib/parse-routes.mjs — the same parser check-routes uses,
// because two parsers drift and the one that is wrong goes quiet.
//
// Run: node scripts/check-admin-audit.mjs
import fs from 'node:fs';
import { parseRoutes } from './lib/parse-routes.mjs';

const ROOT = 'src';
const WORKER = 'src/db/worker.js';
const FACADE = 'src/db/index.js';

/**
 * Admin writes that legitimately record nothing.
 *
 * Empty, and it should stay that way — but it exists so that an exemption is a DELIBERATE line
 * somebody writes and defends, rather than a route that quietly slips through. The same shape as
 * `check-routes`'s PUBLIC allowlist, for the same reason.
 */
const UNAUDITED_BY_DESIGN = new Map([]);

const problems = [];
const { routes, suspects } = parseRoutes(ROOT);

// Inherited from the parser, and fatal here for the same reason: a route this cannot read is a
// route this reports nothing about, and silence reads exactly like a pass.
for (const s of suspects) {
  problems.push(`${s.file}:${s.line} — unparseable route registration (${s.why}); it cannot be audited by a gate that cannot see it`);
}

/* ── the delegation map: which facade call runs which transaction ────────────────────────────── */

const facadeSrc = fs.readFileSync(FACADE, 'utf8');
const workerSrc = fs.readFileSync(WORKER, 'utf8');

// `export const setUserRole = (args) => pool.run(args, { name: 'setUserRoleTx' });`
// Read from the facade rather than assuming the name is the facade name plus "Tx" — the assumption
// would be a second definition of a mapping that already exists in the file above.
const facadeToTx = new Map();
for (const m of facadeSrc.matchAll(/export const (\w+)\s*=\s*\([^)]*\)\s*=>\s*pool\.run\([^;]*?name:\s*'(\w+)'/g)) {
  facadeToTx.set(m[1], m[2]);
}

/**
 * The body of a named worker transaction, brace-matched so a nested block cannot end it early.
 *
 * The parameter list has to be stepped over first. Every transaction in this file takes ONE
 * destructured object — `export function setAccountDisabledTx({ actorId, targetId, ... })` — so the
 * first `{` after the name is the destructuring pattern, not the body. Taking it anyway returns the
 * parameter names as the "body": no audit insert, no role check, and the gate reports four routes
 * as unaudited that audit correctly. Which it did, on the first run.
 */
function txBody(name) {
  const re = new RegExp(`export function ${name}\\b`);
  const m = re.exec(workerSrc);
  if (!m) return null;

  const paren = workerSrc.indexOf('(', m.index + m[0].length);
  if (paren === -1) return null;
  let depth = 0;
  let afterParams = -1;
  for (let i = paren; i < workerSrc.length; i += 1) {
    if (workerSrc[i] === '(') depth += 1;
    else if (workerSrc[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        afterParams = i + 1;
        break;
      }
    }
  }
  if (afterParams === -1) return null;

  const brace = workerSrc.indexOf('{', afterParams);
  if (brace === -1) return null;
  depth = 0;
  for (let i = brace; i < workerSrc.length; i += 1) {
    if (workerSrc[i] === '{') depth += 1;
    else if (workerSrc[i] === '}') {
      depth -= 1;
      if (depth === 0) return workerSrc.slice(brace, i + 1);
    }
  }
  return null;
}

/**
 * Everything a handler can reach: its own text, plus the body of every named transaction it calls.
 *
 * Without this the gate would have to trust that `db.setUserRole(...)` audits, which is precisely
 * the kind of trust it exists to replace.
 */
function reachableFrom(handler) {
  const parts = [handler];
  const seen = [];
  for (const m of handler.matchAll(/\bdb\.(\w+)\s*\(/g)) {
    const tx = facadeToTx.get(m[1]);
    if (!tx || tx === 'all' || tx === 'get' || tx === 'run' || tx === 'writeTx') continue;
    const body = txBody(tx);
    if (body) {
      parts.push(body);
      seen.push(tx);
    } else {
      problems.push(`${FACADE} maps db.${m[1]} to ${tx}, which is not an exported function in ${WORKER}`);
    }
  }
  return { text: parts.join('\n'), delegates: seen };
}

/* ── the three rules ─────────────────────────────────────────────────────────────────────────── */

/**
 * ═══ AN ALIAS MADE THREE ADMIN ROUTES INVISIBLE ════════════════════════════════════════════════
 *
 * This used to be `routes.filter((r) => /requireRole\('admin'\)/.test(r.chain))` — the literal
 * string, in the chain. `src/public/moderation.js:30` writes
 *
 *     const requireAdmin = requireRole('admin');
 *
 * and uses `requireAdmin` on three routes. All three were outside every rule in this file: not
 * checked for an audit row, not checked for a DB role re-check, not checked for a colliding action
 * string. The gate reported "10 admin routes" over a codebase with thirteen.
 *
 * That is the same shape as the four routes the ROUTE PARSER could not see — a gate whose subject
 * is a spelling rather than a meaning. So the aliases are resolved per file first: any identifier
 * bound to `requireRole('admin')` counts as the thing it is.
 */
const ADMIN_MIDDLEWARE = new Set(['requireAdmin']);
for (const file of new Set(routes.map((r) => r.file))) {
  const src = fs.readFileSync(`${ROOT}/${file}`, 'utf8');
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*requireRole\(\s*'admin'\s*\)/g)) {
    ADMIN_MIDDLEWARE.add(m[1]);
  }
}

const isAdminRoute = (chain) =>
  /requireRole\(\s*'admin'\s*\)/.test(chain) ||
  [...ADMIN_MIDDLEWARE].some((name) => new RegExp(`\\b${name}\\b`).test(chain));

const adminRoutes = routes.filter((r) => isAdminRoute(r.chain));

/**
 * action string -> the set of PLACES that write it.
 *
 * A place is a route (for an inline audit row) or a transaction name (for a delegated one) — never
 * a route that merely delegates. The first version of this keyed on routes and immediately reported
 * a collision that was not one: `/disable` and `/enable` both reach `user.disable` and `user.enable`
 * because they share ONE transaction, which picks between them from its `disabled` argument. Two
 * routes reaching a string through the same writer is one writer, and the log stays attributable.
 */
const actions = new Map();
const recordActions = (source, text) => {
  for (const m of text.matchAll(/'([a-z_]+(?:\.[a-z_]+)+)'/g)) {
    if (!actions.has(m[1])) actions.set(m[1], new Set());
    actions.get(m[1]).add(source);
  }
};

/**
 * How this route proves the caller is STILL an admin, or null if it does not.
 *
 * Three accepted forms, and the gate names which one it found rather than answering yes/no — the
 * third is the strongest and the codebase should drift towards it:
 *   assertAdmin       — a read in the handler, before the work
 *   inline read       — the same, written out
 *   under write lock  — the transaction refuses a non-admin actor inside the IMMEDIATE transaction,
 *                       so a role revoked between the check and the write cannot slip through
 */
function recheckForm(handler, text) {
  if (/assertAdmin\s*\(/.test(handler)) return 'assertAdmin';
  if (/SELECT\s+role\s+FROM\s+users/i.test(handler)) return 'inline read';
  // The house form: `SELECT 1 AS ok FROM users WHERE id = ? AND role = 'admin' AND disabled_at IS NULL`
  // bound to the actor, refused on a miss. Matching `role = 'admin'` inside a users read is what
  // recognises it; the first draft looked only for `role !== 'admin'` and reported three correct
  // routes as authorising from the token.
  if (/FROM users WHERE id = \? AND role = 'admin'/.test(text)) return 'under write lock';
  if (/role\s*!==\s*'admin'/.test(text)) return 'under write lock';
  return null;
}

let auditedWrites = 0;
const forms = new Map();

for (const r of adminRoutes) {
  const { text, delegates } = reachableFrom(r.handler);
  const where = delegates.length ? ` (via ${delegates.join(', ')})` : '';

  /* 1 — audited */
  if (r.method !== 'GET') {
    const writesAudit = /INSERT INTO audit_log/.test(text);
    const exempt = UNAUDITED_BY_DESIGN.has(r.key);
    if (!writesAudit && !exempt) {
      problems.push(
        `${r.key} (${r.file}:${r.line}) is an ADMIN WRITE that reaches no INSERT INTO audit_log${where}.\n` +
          '      An unaudited privileged action is indistinguishable from one that never happened.\n' +
          `      Add the audit row inside the same transaction, or add ${r.key} to UNAUDITED_BY_DESIGN with a reason.`,
      );
    }
    if (writesAudit && exempt) {
      problems.push(`${r.key} is listed as UNAUDITED_BY_DESIGN but does write an audit row — delete the entry`);
    }
    if (writesAudit) auditedWrites += 1;

    // 3 — attribute every action string to the place that WRITES it, not the route that reaches it.
    recordActions(r.key, r.handler);
    for (const tx of delegates) recordActions(tx, txBody(tx) ?? '');
  }

  /* 2 — the role is re-read from the database */
  const form = recheckForm(r.handler, text);
  if (!form) {
    problems.push(
      `${r.key} (${r.file}:${r.line}) authorises from the JWT alone${where}.\n` +
        "      `requireRole('admin')` reads a token that can be fifteen minutes stale. Call assertAdmin,\n" +
        '      or delegate to a transaction that refuses a non-admin actor under the write lock.',
    );
  } else {
    forms.set(form, (forms.get(form) ?? 0) + 1);
  }
}

/* 3 — collisions */
for (const [action, sources] of actions) {
  if (sources.size > 1) {
    problems.push(
      `the audit action '${action}' is written from ${sources.size} different places (${[...sources].join(', ')}).\n` +
        '      A log whose rows cannot be attributed to the operation that made them is a counter, not an audit.',
    );
  }
}

/* ── report ──────────────────────────────────────────────────────────────────────────────────── */

const writes = adminRoutes.filter((r) => r.method !== 'GET');
console.log(
  `check-admin-audit: ${adminRoutes.length} admin routes — ${writes.length} writes, ` +
    `${auditedWrites} audited, ${adminRoutes.length - writes.length} reads, ` +
    `${actions.size} distinct audit actions`,
);
// Naming the FORM rather than a boolean, because the three are not equally strong and the shape of
// the drift is the interesting number: a check in the handler leaves a window between it and the
// write, and one under the write lock does not.
console.log(
  `                   re-check: ${[...forms].map(([f, n]) => `${n} ${f}`).join(', ')}`,
);

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  ${p}`);
  console.log(`\ncheck-admin-audit FAILED — ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('check-admin-audit: OK — every admin write is audited and re-checks its actor in the database');
