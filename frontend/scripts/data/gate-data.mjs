// scripts/data/gate-data.mjs — the exemption lists of three gates, as data.
//
// ═══ WHY THE LISTS LEFT THEIR SCRIPTS ══════════════════════════════════════════════════════════
//
// Three gates carry a list of written exceptions, each with its reason:
//
//   i18n-untranslated.json   check-i18n.mjs            keys that are the same string in Hungarian and
//                                                      in another language ON PURPOSE
//   elements-dormant.json    check-element-roster.mjs  feedback elements no component reads yet
//   safe-area-exempt.json    check-safe-area.mjs       edge-pinned elements that need no inset
//
// They used to be `new Map([...])` literals inside those scripts. That made every new exemption an
// edit of a gate script — and `check-i18n` fails in BOTH directions on its list (a string that is
// identical and not listed; a listed key that is translated or gone), so a change to a bundle and
// the change to the list have to land together. A worktree that may not touch a gate script could
// never reach a green build. As data, the list is written by the same tool that writes the bundle.
//
// The RULES did not move. Each script still decides what an exemption means; this file only knows
// how the lists are stored.
//
// ═══ THE SHAPE ═════════════════════════════════════════════════════════════════════════════════
//
//   { "about": "<what the list is and who writes it>",
//     "entries": { "<key>": "<the reason it is exempt>", … } }
//
// One reason per key, never empty: the reason is what tells a reviewer whether an entry is a gap
// to close or a decision to keep, and two of the gates print it when the entry goes stale. Order
// is kept — it is the order the gates iterate in.
//
// Reading FAILS LOUDLY on a missing or malformed file. A gate that quietly ran with an empty list
// would only be right by accident.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.dirname(fileURLToPath(import.meta.url));

/** The three lists. A name outside this set is a typo, not a new list. */
export const GATE_DATA = Object.freeze(['i18n-untranslated', 'elements-dormant', 'safe-area-exempt']);

/** Absolute path of a list's file, resolved from this module — independent of the cwd. */
export function gateDataPath(name) {
  if (!GATE_DATA.includes(name)) {
    throw new Error(`gate-data: "${name}" is not a gate list (known: ${GATE_DATA.join(', ')})`);
  }
  return path.join(DATA_DIR, `${name}.json`);
}

function parse(name) {
  const file = gateDataPath(name);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new Error(`gate-data: ${file} is missing — the gate that reads it cannot run without its exemption list`);
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new Error(`gate-data: ${file} is not valid JSON — ${err.message}`);
  }
  const entries = doc?.entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    throw new Error(`gate-data: ${file} has no "entries" object`);
  }
  for (const [key, reason] of Object.entries(entries)) {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new Error(`gate-data: ${file} lists "${key}" without a reason — every exemption carries one`);
    }
  }
  return { file, text, doc };
}

/**
 * A list as the gates use it: `Map<key, reason>`, in file order.
 *
 * @param {'i18n-untranslated' | 'elements-dormant' | 'safe-area-exempt'} name
 * @returns {Map<string, string>}
 */
export function readGateData(name) {
  return new Map(Object.entries(parse(name).doc.entries));
}

/**
 * Replace a list's entries — for the patch tools (`pulse-i18n`, `pulse-variants`, a lane's
 * `shared.patch` goes through git instead). Gates never call this.
 *
 * It keeps everything a diff should not show: the `about` text, two-space indentation, the final
 * newline, and the line endings the file already has (a working copy here is CRLF or LF depending
 * on how git checked it out). Writing back what was read leaves the file byte-identical.
 *
 * @param {'i18n-untranslated' | 'elements-dormant' | 'safe-area-exempt'} name
 * @param {Map<string, string> | Record<string, string>} entries
 */
export function writeGateData(name, entries) {
  const { file, text, doc } = parse(name);
  const next = entries instanceof Map ? Object.fromEntries(entries) : { ...entries };
  for (const [key, reason] of Object.entries(next)) {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new Error(`gate-data: refusing to write "${key}" to ${name}.json without a reason`);
    }
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const out = `${JSON.stringify({ ...doc, entries: next }, null, 2)}\n`.replace(/\n/g, eol);
  if (out !== text) fs.writeFileSync(file, out);
}
