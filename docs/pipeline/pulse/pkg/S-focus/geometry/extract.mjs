#!/usr/bin/env node
// Copies the payloads of the read-only use_figma walks (S-focus, 2026-10-18; one payload may hold several walks, one per line) out of an agent
// transcript (.jsonl) into <outDir>/<frame>.a.json, so no payload is ever re-typed by hand.
// Usage: node extract.mjs <transcript.jsonl> <outDir>
import fs from 'node:fs';

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) {
  console.error('usage: extract.mjs <transcript.jsonl> <outDir>');
  process.exit(2);
}
const found = new Map();
function visit(v) {
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) return v.forEach(visit);
  if (v.type === 'tool_result') {
    const parts = (typeof v.content === 'string' ? [v.content] : (v.content || []).map((c) => c && c.text).filter(Boolean)).flatMap((p) => p.split(String.fromCharCode(10)));
    for (const p of parts) {
      try {
        const j = JSON.parse(p);
        if (j && j.k && j.id && Array.isArray(j.N)) found.set(`${j.k}.${j.st}`, j);
      } catch {
        /* not a walk payload */
      }
    }
    return;
  }
  Object.values(v).forEach(visit);
}
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line.includes('tool_result')) continue;
  try {
    visit(JSON.parse(line));
  } catch {
    /* a partial line */
  }
}
fs.mkdirSync(outDir, { recursive: true });
for (const [key, j] of found) {
  const out = `${outDir}/${j.k}${j.st ? `.${j.st}` : ''}.a.json`;
  fs.writeFileSync(out, JSON.stringify(j));
  console.log(`${key}: ${j.N.length} rows -> ${out}`);
}
