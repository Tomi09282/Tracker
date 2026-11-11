// src/lib/reason-text.js — the free-text REASON an admin writes when acting on somebody (package
// B-admin-polish): disabling and enabling an account, a coin adjustment's note, an exercise
// rejection. Multi-line prose that lands in the append-only audit_log and is read back on the
// account page by the next admin.
//
// ═══ WHAT THE SECURITY REVIEW FOUND (admin v2, 2026-11-04, attacks 03 / 07) ════════════════════
//
// The reasons were `z.string().trim().min(1).max(2000)` and nothing else. Measured: a NUL, a
// right-to-left override (U+202E) and a lone surrogate were all accepted and stored verbatim in
// audit_log, which can never be corrected (an UPDATE trigger refuses it). The override is the
// dangerous one: it re-orders how the rest of the line renders, so a reason can make an audit entry
// read as something other than what it says - in the one record everybody is told to trust.
//
// ═══ WHAT A REASON MAY CONTAIN ═════════════════════════════════════════════════════════════════
//
// Ordinary writing, including line breaks and tabs (a reason is a paragraph, not a name). Refused
// with a 400, not silently stripped, because the admin should see that what they typed is not what
// would be stored:
//   * malformed UTF-16 (a lone surrogate);
//   * C0 / C1 control characters other than TAB and LF (CR is folded into LF first);
//   * the bidi embeddings, overrides and isolates, and the directional marks (LRM, RLM, ALM).
// The invisible zero-width set (ZWSP, BOM, soft hyphen) is stripped instead: it cannot reorder
// anything, it arrives with pasted text, and refusing a character nobody can see helps no one.
// ZWJ / ZWNJ stay (emoji and Persian / Indic writing need them).
//
// The bounds count code points, after normalisation (NFC) and trim, so they measure what is stored.
import { z } from 'zod';

const FORBIDDEN = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
const STRIPPED = /[\u200B\uFEFF\u00AD]/g;

/** A reason of `min`..`max` code points (min defaults to 1). */
export const reasonText = (max, { min = 1 } = {}) =>
  z
    .string()
    // The outer bound exists so a megabyte is refused before any work runs on it.
    .max(max * 4)
    .refine((v) => v.isWellFormed(), 'malformed text')
    .transform((v) => v.normalize('NFC').replace(/\r\n?/g, '\n').replace(STRIPPED, '').trim())
    .refine((v) => !FORBIDDEN.test(v), 'control and direction characters are not allowed')
    .refine((v) => [...v].length >= min, 'too short')
    .refine((v) => [...v].length <= max, 'too long');
