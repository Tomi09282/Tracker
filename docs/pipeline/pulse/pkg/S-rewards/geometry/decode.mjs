#!/usr/bin/env node
// Decodes the compact chunks of a READ-ONLY use_figma walk (S-rewards, 2026-10-18, copied from S-focus; the decoder S-ma wrote, copied from S-tasks) into the geometry
// format of .pulse/geometry/_README.md, so pulse-shot's geometry probe can compare the built page
// with the frame.
//
// The walk (run through the Figma MCP tool use_figma on file SkWidL9kDDWhBip7cUCFtr, creating and
// changing nothing) returns, per chunk, { k, id, w, h, total, st, next, S, N }: S is a string table,
// each N row is [id, type letter, parentIndex, x, y, w, h, nameIndex, extra?] in document order with
// boxes relative to the frame; extra.t = [charsIndex | -1, family, style, size, lineHeight, tracking %,
// colour, case letter, align letter, autoResize letter, ink box], extra.f / s / r / c / o = fill,
// stroke, radius, clipsContent, opacity.
//
// Usage: node decode.mjs <out.json> <chunk-1.json> [<chunk-2.json> …]
import fs from 'node:fs';

const [out, ...chunks] = process.argv.slice(2);
const TYPES = { F: 'FRAME', T: 'TEXT', R: 'RECTANGLE', E: 'ELLIPSE', V: 'VECTOR', G: 'GROUP', I: 'INSTANCE', C: 'COMPONENT' };
const CASES = { O: 'ORIGINAL', U: 'UPPER', L: 'LOWER', T: 'TITLE' };
const ALIGN = { L: 'LEFT', C: 'CENTER', R: 'RIGHT', J: 'JUSTIFIED' };
const RESIZE = { W: 'WIDTH_AND_HEIGHT', H: 'HEIGHT', N: 'NONE', T: 'TRUNCATE' };

let frame = null;
const rows = [];
for (const file of chunks) {
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  frame ??= c;
  c.N.forEach((row, i) => {
    rows[c.st + i] = row ? { row, S: c.S } : null;
  });
}
const prefix = frame.id.split(':')[0];
const fullId = (id) => (String(id).includes(':') ? String(id) : `${prefix}:${id}`);
const nodes = [];
const depth = [];
rows.forEach((entry, i) => {
  if (!entry) return;
  const { row, S } = entry;
  const [id, t, p, x, y, w, h, nameIdx, extra = {}] = row;
  const parent = p >= 0 && rows[p] ? fullId(rows[p].row[0]) : frame.id;
  depth[i] = p >= 0 ? (depth[p] ?? 0) + 1 : 1;
  const n = { id: fullId(id), name: S[nameIdx], type: TYPES[t] ?? t, x, y, w, h, depth: depth[i], parentId: parent, opacity: extra.o ?? 1 };
  if (extra.f && extra.f[0] !== 'IMG' && extra.f[0] !== 'GRAD') n.fill = { hex: extra.f[0], opacity: extra.f[1] };
  if (extra.f && extra.f[0] === 'IMG') n.image = true;
  if (extra.s) n.stroke = { hex: extra.s[0], weight: extra.s[1] };
  if (extra.r) n.radius = extra.r;
  if (extra.c) n.clipsContent = true;
  if (extra.t) {
    const [ci, family, style, size, lh, lsPct, color, cs, al, rs, ink] = extra.t;
    n.text = {
      characters: ci === -1 ? n.name : S[ci],
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
    if (color) n.fill = { hex: color, opacity: 1 };
  }
  nodes.push(n);
});
const geo = {
  key: `lifeos/${frame.k}`,
  frame: { id: frame.id, name: frame.k, width: frame.w, height: frame.h, page: '174:173', pageName: '17 · PULSE — LifeOS: jutalmak, érmék, admin', fill: { hex: '#0b0d0a', opacity: 1 }, clipsContent: true },
  source: { fileKey: 'SkWidL9kDDWhBip7cUCFtr', method: `read-only use_figma walk of ${frame.id} (visible nodes in document order), 2026-10-18, S-rewards; decoded by docs/pipeline/pulse/pkg/S-rewards/geometry/decode.mjs` },
  nodes,
};
fs.writeFileSync(out, `${JSON.stringify(geo, null, 1)}\n`);
console.log(`${geo.key}: ${nodes.length} nodes (${frame.total} walked) -> ${out}`);
