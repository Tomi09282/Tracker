#!/usr/bin/env node
// Geometry of the S-challenges frames (lifeos/challenges-1, lifeos/challenges-2), from READ-ONLY
// use_figma walks of file SkWidL9kDDWhBip7cUCFtr (nothing created or changed), 2026-10-18.
//
// The walk returns chunks { k, id, w, h, total, st, R }; each R row is
//   [idSuffix, typeLetter, depth, parentIdSuffix, x, y, w, h, name, extra]
// with boxes relative to the frame (absoluteBoundingBox) and extra = { f: [hex, opacity] | i: 1 (image),
// s: [hex, weight], r: radius, c: clips, o: opacity, t: [characters | -1 (= name), family, style, size,
// lineHeight, tracking %, colour, case, align, autoResize, ink box] }.
//
//   node decode.mjs extract <transcript.jsonl> <outDir>   copy the walk payloads out of a transcript (<k>.a.json)
//   node decode.mjs build <outDir> <k.a.json>             write the geometry file (.pulse/geometry/_README.md format)
import fs from 'node:fs';
import path from 'node:path';

const [cmd, a, b] = process.argv.slice(2);
const TYPES = { F: 'FRAME', T: 'TEXT', R: 'RECTANGLE', E: 'ELLIPSE', V: 'VECTOR', G: 'GROUP', I: 'INSTANCE', C: 'COMPONENT' };
const CASES = { O: 'ORIGINAL', U: 'UPPER', L: 'LOWER', T: 'TITLE' };
const ALIGN = { L: 'LEFT', C: 'CENTER', R: 'RIGHT', J: 'JUSTIFIED' };
const RESIZE = { W: 'WIDTH_AND_HEIGHT', H: 'HEIGHT', N: 'NONE', T: 'TRUNCATE' };
const PAGES = { '190': ['174:2', '16 · PULSE — LifeOS: Naptár, fókusz, kihívás'] };

if (cmd === 'extract') {
  const found = new Map();
  const visit = (v) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(visit);
    if (v.type === 'tool_result') {
      const parts = typeof v.content === 'string' ? [v.content] : (v.content || []).map((c) => c && c.text).filter(Boolean);
      for (const p of parts) {
        try {
          const j = JSON.parse(p);
          if (j && j.k && j.id && Array.isArray(j.R)) {
            const all = found.get(j.k) ?? { k: j.k, id: j.id, w: j.w, h: j.h, total: j.total, R: [] };
            j.R.forEach((row, i) => (all.R[j.st + i] = row));
            found.set(j.k, all);
          }
        } catch {
          /* not a walk payload */
        }
      }
      return;
    }
    Object.values(v).forEach(visit);
  };
  for (const line of fs.readFileSync(a, 'utf8').split('\n')) {
    if (!line.includes('tool_result')) continue;
    try {
      visit(JSON.parse(line));
    } catch {
      /* partial line */
    }
  }
  fs.mkdirSync(b, { recursive: true });
  for (const [k, j] of found) {
    const have = j.R.filter(Boolean).length;
    if (have !== j.total) console.error(`${k}: ${have} of ${j.total} rows`);
    fs.writeFileSync(path.join(b, `${k}.a.json`), JSON.stringify(j));
    console.log(`${k}: ${have} / ${j.total} rows -> ${path.join(b, `${k}.a.json`)}`);
  }
} else if (cmd === 'build') {
  const j = JSON.parse(fs.readFileSync(b, 'utf8'));
  const prefix = j.id.split(':')[0];
  const nodes = j.R.map(([id, t, depth, parent, x, y, w, h, name, e = {}]) => {
    const n = { id: `${prefix}:${id}`, name, type: TYPES[t] ?? t, x, y, w, h, depth, parentId: `${prefix}:${parent}`, opacity: e.o ?? 1 };
    if (e.f) n.fill = { hex: e.f[0], opacity: e.f[1] };
    if (e.i) n.image = true;
    if (e.s) n.stroke = { hex: e.s[0], weight: e.s[1] };
    if (e.r) n.radius = e.r;
    if (e.c) n.clipsContent = true;
    if (e.t) {
      const [ch, family, style, size, lh, lsPct, color, cs, al, rs, ink] = e.t;
      n.text = {
        characters: ch === -1 ? name : ch,
        fontFamily: family,
        fontStyle: style,
        fontSize: size,
        lineHeightPx: lh,
        letterSpacing: Math.round(((lsPct * size) / 100) * 100) / 100,
        letterSpacingPercent: lsPct,
        color,
        colorOpacity: color ? 1 : null,
        case: CASES[cs] ?? cs,
        align: ALIGN[al] ?? al,
        autoResize: RESIZE[rs] ?? rs,
        ink: ink ? { x: ink[0], y: ink[1], w: ink[2], h: ink[3] } : null,
      };
    }
    return n;
  });
  const [page, pageName] = PAGES[prefix] ?? [null, null];
  const geo = {
    key: `lifeos/${j.k}`,
    frame: { id: j.id, name: j.k, width: j.w, height: j.h, page, pageName, fill: { hex: '#0b0d0a', opacity: 1 }, clipsContent: true },
    source: { fileKey: 'SkWidL9kDDWhBip7cUCFtr', method: `read-only use_figma walk of ${j.id} (visible nodes in document order), 2026-10-18, S-challenges; decoded by docs/pipeline/pulse/pkg/S-challenges/geometry/decode.mjs` },
    nodes,
  };
  const out = path.join(a, `${j.k}.json`);
  fs.writeFileSync(out, `${JSON.stringify(geo, null, 1)}\n`);
  console.log(`${geo.key}: ${nodes.length} nodes -> ${out}`);
} else {
  console.error('usage: decode.mjs extract <transcript.jsonl> <outDir> | build <outDir> <k.a.json>');
  process.exit(2);
}
