// scripts/brain-gen.mjs — regenerates the data-model and API sections of the brain.
//
// These notes were hand-written once and were describing a deleted implementation within a day:
// a `name_hu` column that no longer exists, endpoints that were never rebuilt, index notes whose
// Dataview queries listed nothing because the per-entity notes were never created.
//
// A memory that confidently describes code that is gone is worse than no memory, because the
// next session believes it. So these notes are DERIVED — from the live schema and from the
// actually-mounted Express routers — and regenerating them is a command, not a chore.
//
// Usage: node scripts/brain-gen.mjs
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as db from '../src/db/index.js';

const BRAIN = path.resolve('../docs/brain');
const STAMP = new Date().toISOString().slice(0, 10);

const banner = `> [!info] Generated file\n> Written by \`backend/scripts/brain-gen.mjs\` from the LIVE schema and the mounted routers.\n> Do not hand-edit — run \`npm run brain:gen\` instead. Last generated: ${STAMP}.`;

// --- schema introspection ---------------------------------------------------------------------
const version = (await db.get('PRAGMA user_version')).user_version;

const tables = (
  await db.all(
    `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'
        AND name NOT LIKE '%_config' OR name = 'element_style_config'
      ORDER BY name`,
  )
).map((r) => r.name);

const ftsTables = (
  await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts' ORDER BY name")
).map((r) => r.name);

async function describe(table) {
  const columns = await db.all(`PRAGMA table_info(${table})`);
  const fks = await db.all(`PRAGMA foreign_key_list(${table})`);
  const indexes = await db.all(`PRAGMA index_list(${table})`);
  const sql = (await db.get('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?', ['table', table]))?.sql ?? '';
  const triggers = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? ORDER BY name",
    [table],
  );
  const rows = (await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n;
  return { table, columns, fks, indexes, triggers, rows, sql };
}

const described = [];
for (const t of tables) described.push(await describe(t));

// --- one note per table ------------------------------------------------------------------------
const dir = path.join(BRAIN, '20-Data-Model');
await fs.mkdir(dir, { recursive: true });

// Remove previously generated table notes so a dropped table does not linger as a ghost.
for (const f of await fs.readdir(dir)) {
  if (f === 'ERD.md') continue;
  const body = await fs.readFile(path.join(dir, f), 'utf8').catch(() => '');
  if (body.includes('type: table')) await fs.rm(path.join(dir, f));
}

for (const d of described) {
  const cols = d.columns
    .map((c) => {
      const fk = d.fks.find((f) => f.from === c.name);
      const notes = [
        c.pk ? 'PK' : null,
        c.notnull ? 'NOT NULL' : null,
        c.dflt_value ? `default ${c.dflt_value}` : null,
        fk ? `→ ${fk.table}.${fk.to}` : null,
      ].filter(Boolean);
      return `| \`${c.name}\` | ${c.type || '—'} | ${notes.join(', ') || '' } |`;
    })
    .join('\n');

  const checks = [...d.sql.matchAll(/CHECK\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gi)]
    .map((m) => m[1].replace(/\s+/g, ' ').trim())
    .slice(0, 12);

  const summary = `${d.columns.length} columns, ${d.rows} rows`;

  await fs.writeFile(
    path.join(dir, `${d.table}.md`),
    `---
type: table
table: ${d.table}
summary: ${summary}
rows: ${d.rows}
tags: [data-model, generated]
---

# \`${d.table}\`

${banner}

| Column | Type | Notes |
|---|---|---|
${cols}

${d.fks.length ? `## Foreign keys\n\n${d.fks.map((f) => `- \`${f.from}\` → \`${f.table}.${f.to}\` (on delete ${f.on_delete})`).join('\n')}\n` : ''}
${d.indexes.length ? `## Indexes\n\n${d.indexes.map((i) => `- \`${i.name}\`${i.unique ? ' (unique)' : ''}${i.partial ? ' (partial)' : ''}`).join('\n')}\n` : ''}
${d.triggers.length ? `## Triggers\n\n${d.triggers.map((t) => `- \`${t.name}\``).join('\n')}\n` : ''}
${checks.length ? `## Constraints\n\n${checks.map((c) => `- \`${c}\``).join('\n')}\n` : ''}
Back to [[ERD]].
`,
  );
}

// --- ERD index ---------------------------------------------------------------------------------
const edges = described.flatMap((d) =>
  d.fks.map((f) => `  ${f.table} ||--o{ ${d.table} : "${f.from}"`),
);

await fs.writeFile(
  path.join(dir, 'ERD.md'),
  `---
type: data-model
title: Data model
schema_version: ${version}
tags: [data-model, erd, generated]
---

# Data model — schema version ${version}

${banner}

${described.length} tables${ftsTables.length ? `, plus ${ftsTables.length} FTS5 shadow table${ftsTables.length > 1 ? 's' : ''} (\`${ftsTables.join('`, `')}\`)` : ''}.

\`\`\`mermaid
erDiagram
${[...new Set(edges)].join('\n')}
\`\`\`

## Tables

| Table | Columns | Rows |
|---|---|---|
${described.map((d) => `| [[${d.table}]] | ${d.columns.length} | ${d.rows} |`).join('\n')}

## Conventions that hold everywhere

- \`INTEGER PRIMARY KEY id\`; \`created_at\` / \`updated_at\` as unix epoch seconds.
- Enums are CHECK constraints; a lookup TABLE is used wherever an admin must edit the set.
- Junction tables for every m:n relation — never a JSON list of relations.
- JSON columns only for non-relational config blobs (a gradient definition, a notification payload).
- Every client-owned row carries an owner column with a composite index.
`,
);

// --- API surface --------------------------------------------------------------------------------
// MUST list every router server.js mounts. A missing entry does not fail — it silently
// under-reports the API surface, which is the worst kind of documentation bug: confidently
// incomplete. The assertion below catches it.
const routers = [
  ['/api/v1/auth', '../src/auth/routes.js'],
  ['/api/v1', '../src/theme/routes.js'],
  ['/api/v1', '../src/exercises/routes.js'],
  ['/api/v1', '../src/exercises/media.js'],
  ['/api/v1', '../src/admin/routes.js'],
  ['/api/v1', '../src/coaching/routes.js'],
  ['/api/v1', '../src/onboarding/routes.js'],
  ['/api/v1', '../src/plans/routes.js'],
  ['/api/v1', '../src/logs/routes.js'],
  ['/api/v1', '../src/chat/routes.js'],
  ['/api/v1', '../src/notifications/routes.js'],
  ['/api/v1', '../src/chat/attachments.js'],
  ['/api/v1', '../src/plans/ics.js'],
  ['/api/v1', '../src/nutrition/routes.js'],
  ['/api/v1', '../src/progress/routes.js'],
  ['/api/v1', '../src/coins/routes.js'],
  ['/api/v1', '../src/public/routes.js'],
];

// Cross-check against server.js so adding a router without adding it here is caught here,
// rather than by someone noticing months later that an endpoint was never documented.
const serverSrc = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
// THE CROSS-CHECK HAD A BLIND SPOT, AND IT COST A PHASE OF DOCUMENTATION.
//
// The old pattern was `import\s+\w+\s+from` — a single default binding and nothing else. So
// `import progressRoutes, { uploadRouter as progressUploadRoutes } from './src/progress/routes.js'`
// did not match, the router was invisible to the guard, and the whole F10 progress API has been
// undocumented since Phase 4 with nothing saying so.
//
// That is the failure mode this file's own comment warns about — "confidently incomplete" — and
// the guard against it was itself confidently incomplete. The clause now accepts a default
// binding, a named list, or both, so the only way to hide a router from it is not to import it.
// A ROUTER IS ALWAYS A DEFAULT EXPORT, and that is what makes this precise rather than merely
// wide. The first widening accepted named-only imports too and immediately flagged
// `import { ensureDirs, sweepQuarantine } from './src/lib/media.js'` — a LIBRARY that happens to
// end in media.js. Requiring the default binding separates the two exactly: a router is mounted
// with `app.use`, so it has one; a helper module does not.
//
// The optional `, { … }` after it is the clause that was missing and cost a phase: `import
// progressRoutes, { uploadRouter as progressUploadRoutes } from …` did not match the old pattern,
// so the F10 progress API was invisible to this guard and undocumented since Phase 4.
const mounted = [
  ...serverSrc.matchAll(
    /import\s+\w+\s*(?:,\s*\{[^}]*\}\s*)?from\s+'(\.\/src\/[^']+routes?\.js|\.\/src\/[^']+media\.js)'/g,
  ),
].map((m) => m[1].replace('./src/', '../src/'));
const missing = mounted.filter((m) => !routers.some(([, file]) => file === m));
if (missing.length) {
  console.error(`brain-gen: server.js mounts routers this script does not know about: ${missing.join(', ')}`);
  process.exit(1);
}

const endpoints = [];
for (const [mount, file] of routers) {
  const mod = await import(file);
  for (const layer of mod.default?.stack ?? []) {
    if (!layer.route) continue;
    const method = Object.keys(layer.route.methods ?? {})[0]?.toUpperCase() ?? '?';
    // Middleware names are the cheapest honest signal of what guards a route.
    const guards = (layer.route.stack ?? []).map((s) => s.name).filter((n) => n && n !== '<anonymous>' && n !== 'handle');
    endpoints.push({
      method,
      path: `${mount}${layer.route.path}`.replace('//', '/'),
      guards: [...new Set(guards)],
      file: file.replace('../', 'backend/'),
    });
  }
}
endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const apiDir = path.join(BRAIN, '30-API');
await fs.mkdir(apiDir, { recursive: true });

await fs.writeFile(
  path.join(apiDir, 'Endpoints.md'),
  `---
type: api-index
title: API surface
count: ${endpoints.length}
tags: [api, moc, generated]
---

# API surface — ${endpoints.length} endpoints

${banner}

Guards are read from the middleware actually mounted on each route, so this cannot claim a
protection the code does not have.

| Method | Path | Guards |
|---|---|---|
${endpoints.map((e) => `| ${e.method} | \`${e.path}\` | ${e.guards.length ? e.guards.map((g) => `\`${g}\``).join(', ') : '—'} |`).join('\n')}

## Invariants that apply to every endpoint

- Error envelope \`{error, code, requestId}\`; codes come from \`ERR\` in \`src/lib/http.js\`.
- Bodies, params and query strings validated with \`.strict()\` zod schemas before use.
- Client-owned rows: ownership re-validated on every read AND write; a miss is **404, never 403**.
- Lists: whitelisted sort keys, keyset cursors, page size capped server-side.
- Health and config are the only routes above the CSRF middleware, and both are GET-only.
`,
);

console.log(`brain-gen: ${described.length} table notes, 1 ERD, ${endpoints.length} endpoints (schema v${version})`);
await db.closePool();
