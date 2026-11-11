// Bundles a copy of frontend/src/lib/api.ts and counts the requests one wrong step-up password causes.
// usage: node run.mjs <frontend dir> <api.ts> <out.mjs>
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [frontendDir, src, out] = process.argv.slice(2);
const require = createRequire(path.join(frontendDir, 'package.json'));
const ts = require('typescript');
const { readFileSync, writeFileSync } = await import('node:fs');
writeFileSync(out, ts.transpileModule(readFileSync(src, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);

const calls = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  calls.push(`${init?.method ?? 'GET'} ${u}`);
  if (u.includes('/auth/refresh')) return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  const body = u.endsWith('/admin/users/7/role')
    ? { error: 'invalid credentials', code: 'unauthorized', reason: 'step_up_failed', requestId: 'r' }
    : { error: 'unauthorized', code: 'unauthorized', requestId: 'r' };
  return new Response(JSON.stringify(body), { status: 401, headers: { 'content-type': 'application/json' } });
};

const m = await import(pathToFileURL(out).href);
try {
  await m.apiWithRefresh('/admin/users/7/role', { method: 'POST', body: { role: 'admin', password: 'wrong' } });
} catch {
  /* expected */
}
console.log('step-up 401 ->', calls.length, 'requests', JSON.stringify(calls));
calls.length = 0;
try {
  await m.apiWithRefresh('/admin/users/7', {});
} catch {
  /* expected */
}
console.log('session 401 ->', calls.length, 'requests', JSON.stringify(calls));
