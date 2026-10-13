#!/usr/bin/env node
// docs/pipeline/pulse/pkg/_int/proofs/F1.2/font-tables.mjs — what a .woff2 file itself says.
//
// The second reading behind `glyph-check.mjs`: that script measures what a browser DOES with a face;
// this one reads what the binary HOLDS, without a browser. It answers three questions about a file:
//
//   - which variation axes it has (`fvar`);
//   - which OpenType substitution features it has (`GSUB`) — `tnum` is the one `tabular-nums` asks
//     for; a file without it cannot set its figures on one advance, whatever the CSS says;
//   - whether its character map (`cmap`) holds given code points (default: ő ű Ő Ű and 0-9).
//
// A browser measurement that says "tabular-nums changes nothing" and a `GSUB` without `tnum` are two
// independent observations of the same fact; one without the other could be a mistake of the method.
//
// Usage:
//   node docs/pipeline/pulse/pkg/_int/proofs/F1.2/font-tables.mjs <file.woff2> [<file.woff2> …]
//   node …/font-tables.mjs --json <file.woff2> …         machine-readable
//
// WOFF2 (W3C REC): a 48-byte header, a table directory, then ONE Brotli stream holding the tables in
// directory order. `cmap`, `GSUB` and `fvar` are stored untransformed, so they can be read straight
// out of the decompressed stream. Node's own zlib does the Brotli; there is no dependency.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

// prettier-ignore
const KNOWN_TAGS = ['cmap','head','hhea','hmtx','maxp','name','OS/2','post','cvt ','fpgm','glyf','loca','prep','CFF ','VORG','EBDT','EBLC','gasp','hdmx','kern','LTSH','PCLT','VDMX','vhea','vmtx','BASE','GDEF','GPOS','GSUB','EBSC','JSTF','MATH','CBDT','CBLC','COLR','CPAL','SVG ','sbix','acnt','avar','bdat','bloc','bsln','cvar','fdsc','feat','fmtx','fvar','gvar','hsty','just','lcar','mort','morx','opbd','prop','trak','Zapf','Silf','Glat','Gloc','Feat','Sill'];

/** @returns {Record<string, {data: Buffer, transformed: boolean}>} */
export const readWoff2Tables = (buffer) => {
  if (buffer.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const numTables = buffer.readUInt16BE(12);
  const totalCompressedSize = buffer.readUInt32BE(20);
  let p = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = buffer[p++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error('malformed UIntBase128');
  };
  const directory = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buffer[p++];
    const index = flags & 0x3f;
    const version = flags >> 6;
    let tag = KNOWN_TAGS[index];
    if (index === 63) {
      tag = buffer.toString('latin1', p, p + 4);
      p += 4;
    }
    const origLength = base128();
    // glyf and loca are transformed when the version is 0; every other table when it is not 0.
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    directory.push({ tag, length: transformed ? base128() : origLength, transformed });
  }
  const stream = zlib.brotliDecompressSync(buffer.subarray(p, p + totalCompressedSize));
  const tables = {};
  let offset = 0;
  for (const entry of directory) {
    tables[entry.tag] = { data: stream.subarray(offset, offset + entry.length), transformed: entry.transformed };
    offset += entry.length;
  }
  if (offset !== stream.length) throw new Error(`table lengths (${offset}) do not add up to the stream (${stream.length})`);
  return tables;
};

const fixed = (b, o) => b.readInt32BE(o) / 65536;

export const axesOf = (tables) => {
  const t = tables.fvar?.data;
  if (!t) return [];
  const start = t.readUInt16BE(4);
  const count = t.readUInt16BE(8);
  const size = t.readUInt16BE(10);
  return Array.from({ length: count }, (_, i) => {
    const o = start + i * size;
    return { tag: t.toString('latin1', o, o + 4), min: fixed(t, o + 4), default: fixed(t, o + 8), max: fixed(t, o + 12) };
  });
};

export const gsubFeaturesOf = (tables) => {
  const t = tables.GSUB?.data;
  if (!t) return [];
  const list = t.readUInt16BE(6);
  const count = t.readUInt16BE(list);
  return [...new Set(Array.from({ length: count }, (_, i) => t.toString('latin1', list + 2 + i * 6, list + 6 + i * 6)))].sort();
};

/** @returns {(codePoint: number) => number} glyph id, 0 = not mapped */
export const cmapOf = (tables) => {
  const t = tables.cmap?.data;
  if (!t) return () => 0;
  const records = Array.from({ length: t.readUInt16BE(2) }, (_, i) => ({
    platform: t.readUInt16BE(4 + i * 8),
    encoding: t.readUInt16BE(6 + i * 8),
    offset: t.readUInt32BE(8 + i * 8),
  })).map((r) => ({ ...r, format: t.readUInt16BE(r.offset) }));
  const pick =
    records.find((r) => r.format === 12 && (r.platform === 3 || r.platform === 0)) ??
    records.find((r) => r.format === 4 && (r.platform === 3 || r.platform === 0));
  if (!pick) throw new Error(`no format 4 or 12 cmap subtable (found ${records.map((r) => r.format).join(', ')})`);
  const o = pick.offset;
  if (pick.format === 12) {
    const groups = t.readUInt32BE(o + 12);
    return (cp) => {
      for (let i = 0; i < groups; i++) {
        const g = o + 16 + i * 12;
        const first = t.readUInt32BE(g);
        if (cp >= first && cp <= t.readUInt32BE(g + 4)) return t.readUInt32BE(g + 8) + (cp - first);
      }
      return 0;
    };
  }
  const segments = t.readUInt16BE(o + 6) / 2;
  const ends = o + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  return (cp) => {
    if (cp > 0xffff) return 0;
    for (let i = 0; i < segments; i++) {
      if (cp > t.readUInt16BE(ends + i * 2)) continue;
      const start = t.readUInt16BE(starts + i * 2);
      if (cp < start) return 0;
      const delta = t.readUInt16BE(deltas + i * 2);
      const rangeOffset = t.readUInt16BE(rangeOffsets + i * 2);
      if (rangeOffset === 0) return (cp + delta) & 0xffff;
      const glyph = t.readUInt16BE(rangeOffsets + i * 2 + rangeOffset + (cp - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
};

export const describeFont = (file, codePoints) => {
  const tables = readWoff2Tables(fs.readFileSync(file));
  const glyphOf = cmapOf(tables);
  const features = gsubFeaturesOf(tables);
  return {
    file: path.basename(file),
    bytes: fs.statSync(file).size,
    axes: axesOf(tables),
    gsubFeatures: features,
    tnum: features.includes('tnum'),
    mapped: Object.fromEntries(codePoints.map((cp) => [String.fromCodePoint(cp), glyphOf(cp) !== 0])),
  };
};

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const fileArgs = args.filter((a) => !a.startsWith('--'));
  if (fileArgs.length === 0) {
    console.error('usage: node font-tables.mjs [--json] <file.woff2> [<file.woff2> …]');
    process.exit(2);
  }
  const codePoints = [0x151, 0x171, 0x150, 0x170, ...Array.from({ length: 10 }, (_, i) => 0x30 + i)];
  const described = fileArgs.map((f) => describeFont(f, codePoints));
  if (json) console.log(JSON.stringify(described, null, 2));
  else {
    for (const d of described) {
      const has = (chars) => chars.map((c) => `${c}${d.mapped[c] ? '' : ' (absent)'}`).join(' ');
      console.log(`${d.file} — ${d.bytes} bytes`);
      console.log(`  axes:     ${d.axes.map((a) => `${a.tag} ${a.min}..${a.max} (default ${a.default})`).join(', ') || 'none (static)'}`);
      console.log(`  GSUB:     ${d.gsubFeatures.join(' ') || 'none'}`);
      console.log(`  tnum:     ${d.tnum ? 'present' : 'ABSENT — tabular-nums cannot change this file\'s figures'}`);
      console.log(`  cmap:     ${has(['ő', 'ű', 'Ő', 'Ű'])} | digits ${'0123456789'.split('').every((c) => d.mapped[c]) ? 'all ten' : has('0123456789'.split(''))}`);
    }
  }
}
